"""Explicit public URL imports, with DNS-pinned connections and bounded extraction."""

import base64
import http.client
import ipaddress
import json
import socket
import ssl
import subprocess
import sys
import time
import zlib
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

from life_app.platform.assistant.documents import (
    MAX_FILE_BYTES,
    MAX_TEXT_CHARS,
    DocumentError,
    bounded_text,
    parse_document,
    safe_name,
    text_file,
)

MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 20
TRANSITION_NETWORKS = tuple(
    ipaddress.ip_network(value)
    for value in (
        "64:ff9b::/96",
        "64:ff9b:1::/48",
        "2002::/16",
        "2001::/32",
    )
)


@dataclass
class WebDocument:
    url: str
    name: str
    media_type: str
    data: bytes
    text: str | None
    page_count: int | None = None


def normalize_url(url):
    if not isinstance(url, str) or not 1 <= len(url) <= 2048:
        raise DocumentError("source_url_invalid")
    if any(ord(c) < 33 or ord(c) == 127 for c in url) or "\\" in url:
        raise DocumentError("source_url_invalid")
    try:
        parts = urlsplit(url)
        if parts.scheme not in {"http", "https"} or not parts.hostname:
            raise ValueError
        if parts.username is not None or parts.password is not None:
            raise ValueError
        port = parts.port if parts.port is not None else (443 if parts.scheme == "https" else 80)
        if port not in {80, 443} or "%" in parts.hostname:
            raise ValueError
        host = parts.hostname.encode("idna").decode("ascii")
        authority = f"[{host}]" if ":" in host else host
        if port != (443 if parts.scheme == "https" else 80):
            authority += f":{port}"
        path = quote(parts.path or "/", safe="/%:@!$&'()*+,;=-._~")
        query = quote(parts.query, safe="/%?:@!$&'()*+,;=-._~")
        result = urlunsplit((parts.scheme, authority, path, query, ""))
        if len(result) > 2048:
            raise ValueError
        return result
    except (UnicodeError, ValueError):
        raise DocumentError("source_url_invalid") from None


def public_addresses(host, port):
    """Reject mixed public/private answers; connect only to these exact addresses."""
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses:
        raise DocumentError("source_web_unavailable")
    for _, _, _, _, sockaddr in addresses:
        address = ipaddress.ip_address(sockaddr[0])
        if not address.is_global or address.is_multicast:
            raise DocumentError("source_url_forbidden")
        if isinstance(address, ipaddress.IPv6Address):
            if address.ipv4_mapped and not address.ipv4_mapped.is_global:
                raise DocumentError("source_url_forbidden")
            if any(address in network for network in TRANSITION_NETWORKS):
                raise DocumentError("source_url_forbidden")
    return addresses


class PinnedConnection(http.client.HTTPConnection):
    def __init__(self, host, port, address, *, secure, timeout):
        super().__init__(host, port, timeout=timeout)
        self.address = address
        self.secure = secure

    def connect(self):
        family, kind, protocol, _, sockaddr = self.address
        sock = socket.socket(family, kind, protocol)
        try:
            sock.settimeout(self.timeout)
            sock.connect(sockaddr)
            if self.secure:
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=self.host)
            self.sock = sock
        except BaseException:
            sock.close()
            raise


class PageText(HTMLParser):
    OMIT = {"script", "style", "noscript", "template", "svg", "iframe", "object"}
    BLOCK = {"p", "div", "br", "li", "tr", "section", "article", "h1", "h2", "h3", "h4"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = []
        self.parts = []
        self.length = 0
        self.in_title = False
        self.title = ""

    def handle_starttag(self, tag, attrs):
        if tag in self.OMIT:
            self.hidden.append(tag)
        if self.hidden:
            return
        if tag == "title":
            self.in_title = True
        if tag in self.BLOCK:
            self._append("\n")

    def handle_endtag(self, tag):
        if self.hidden:
            if tag == self.hidden[-1]:
                self.hidden.pop()
            return
        if tag == "title":
            self.in_title = False
        if tag in self.BLOCK:
            self._append("\n")

    def handle_data(self, value):
        if self.hidden:
            return
        if self.in_title:
            self.title = (self.title + value)[:200]
        self._append(value)

    def _append(self, value):
        self.length += len(value)
        if self.length > MAX_TEXT_CHARS:
            raise DocumentError("source_text_too_large")
        self.parts.append(value)


def html_text(data, charset):
    try:
        value = data.decode(charset or "utf-8", errors="strict")
    except (UnicodeError, LookupError):
        raise DocumentError("source_text_encoding") from None
    parser = PageText()
    parser.feed(value)
    parser.close()
    return bounded_text("\n".join(line.strip() for line in "".join(parser.parts).splitlines())), (
        safe_name(parser.title) if parser.title.strip() else None
    )


def _remaining(deadline):
    seconds = deadline - time.monotonic()
    if seconds <= 0:
        raise DocumentError("source_web_timeout")
    return min(seconds, 8)


def _read_response(response, connection, deadline):
    encoding = response.getheader("Content-Encoding", "identity").lower().strip()
    if encoding not in {"identity", "gzip"}:
        raise DocumentError("source_web_format")
    length = response.getheader("Content-Length")
    if length is not None:
        try:
            if int(length) > MAX_FILE_BYTES or int(length) < 0:
                raise DocumentError("source_file_too_large")
        except ValueError:
            raise DocumentError("source_web_unavailable") from None
    decoder = zlib.decompressobj(16 + zlib.MAX_WBITS) if encoding == "gzip" else None
    received = 0
    result = bytearray()
    while True:
        if connection.sock is not None:
            connection.sock.settimeout(_remaining(deadline))
        else:
            _remaining(deadline)
        chunk = response.read(64 * 1024)
        if not chunk:
            break
        received += len(chunk)
        if received > MAX_FILE_BYTES:
            raise DocumentError("source_file_too_large")
        if decoder:
            chunk = decoder.decompress(chunk, MAX_FILE_BYTES - len(result) + 1)
        result.extend(chunk)
        if len(result) > MAX_FILE_BYTES:
            raise DocumentError("source_file_too_large")
    if decoder:
        result.extend(decoder.flush(MAX_FILE_BYTES - len(result) + 1))
        if len(result) > MAX_FILE_BYTES:
            raise DocumentError("source_file_too_large")
        if not decoder.eof or decoder.unused_data:
            raise DocumentError("source_web_unavailable")
    return bytes(result)


def _fetch(url):
    deadline = time.monotonic() + TIMEOUT_SECONDS
    url = normalize_url(url)
    for redirect in range(MAX_REDIRECTS + 1):
        parts = urlsplit(url)
        port = parts.port if parts.port is not None else (443 if parts.scheme == "https" else 80)
        addresses = public_addresses(parts.hostname, port)
        connection = None
        response = None
        for address in addresses[:4]:
            try:
                connection = PinnedConnection(
                    parts.hostname,
                    port,
                    address,
                    secure=parts.scheme == "https",
                    timeout=_remaining(deadline),
                )
                connection.request(
                    "GET",
                    urlunsplit(("", "", parts.path, parts.query, "")),
                    headers={
                        "User-Agent": "LifeOS-SourceReader/1.0",
                        "Accept": "text/html, text/plain, application/pdf",
                        "Accept-Encoding": "identity",
                        "Connection": "close",
                    },
                )
                response = connection.getresponse()
                break
            except (OSError, http.client.HTTPException):
                if connection:
                    connection.close()
        if response is None:
            raise DocumentError("source_web_unavailable")
        try:
            if response.status in {301, 302, 303, 307, 308}:
                target = response.getheader("Location")
                if not target or redirect == MAX_REDIRECTS:
                    raise DocumentError("source_web_redirects")
                next_url = normalize_url(urljoin(url, target))
                if parts.scheme == "https" and urlsplit(next_url).scheme != "https":
                    raise DocumentError("source_url_forbidden")
                url = next_url
                continue
            if response.status != 200:
                raise DocumentError("source_web_unavailable")
            media_type = response.headers.get_content_type()
            if media_type not in {
                "text/html",
                "application/xhtml+xml",
                "text/plain",
                "text/markdown",
                "text/csv",
                "application/pdf",
            }:
                raise DocumentError("source_web_format")
            data = _read_response(response, connection, deadline)
            return {
                "url": url,
                "media_type": media_type,
                "charset": response.headers.get_content_charset(),
                "data": base64.b64encode(data).decode("ascii"),
            }
        finally:
            response.close()
            connection.close()
    raise DocumentError("source_web_redirects")


def fetch_url(url):
    """A hard parent deadline also bounds DNS and slow HTTP headers."""
    url = normalize_url(url)
    try:
        process = subprocess.run(
            [sys.executable, "-m", __name__],
            input=url.encode(),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=25,
            check=False,
        )
        if process.returncode != 0:
            raise DocumentError("source_web_unavailable")
        result = json.loads(process.stdout)
        if "error" in result:
            raise DocumentError(result["error"])
        data = base64.b64decode(result["data"], validate=True)
        if result["media_type"] == "application/pdf":
            name = safe_name(urlsplit(result["url"]).path) or "page.pdf"
            if not name.lower().endswith(".pdf"):
                name = name[:196] + ".pdf"
            parsed = parse_document(data, name)
            return WebDocument(
                result["url"], parsed.name, parsed.media_type, data, parsed.text, parsed.page_count
            )
        text = data.decode("utf-8")
        return WebDocument(result["url"], result["name"], "text/plain", data, text)
    except subprocess.TimeoutExpired:
        raise DocumentError("source_web_timeout") from None
    except (ValueError, TypeError, KeyError, OSError):
        raise DocumentError("source_web_unavailable") from None


def _main():
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    try:
        result = _fetch(sys.stdin.buffer.read(8192).decode())
        if result["media_type"] != "application/pdf":
            data = base64.b64decode(result["data"], validate=True)
            if result["media_type"] in {"text/html", "application/xhtml+xml"}:
                text, title = html_text(data, result.get("charset"))
            else:
                charset = result.get("charset")
                if charset:
                    try:
                        data = data.decode(charset).encode("utf-8")
                    except (UnicodeError, LookupError):
                        raise DocumentError("source_text_encoding") from None
                text, title = text_file(data), None
            result["name"] = title or safe_name(urlsplit(result["url"]).hostname)
            result["media_type"] = "text/plain"
            result["data"] = base64.b64encode(text.encode()).decode("ascii")
    except DocumentError as error:
        result = {"error": error.code}
    except Exception:
        result = {"error": "source_web_unavailable"}
    print(json.dumps(result))


if __name__ == "__main__":
    _main()
