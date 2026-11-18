"""Untrusted URLs never connect to internal hosts or escape bounded imports."""

import gzip
import io
import socket
from email.message import Message

import pytest

from life_app.platform.assistant import web_sources as w
from life_app.platform.assistant.documents import DocumentError


def address(ip="93.184.216.34", port=443):
    return (socket.AF_INET6 if ":" in ip else socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/file",
        "https://user:pass@example.com/",
        "https://example.com:22/",
        "https://example.com/\r\nHost: local",
        "http://[fe80::1%eth0]/",
        "https://example.com\\@127.0.0.1/",
        "https://example.com:0/",
    ],
)
def test_unsafe_url_syntax_is_rejected(url):
    with pytest.raises(DocumentError, match="source_url_invalid"):
        w.normalize_url(url)


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "0.0.0.0",
        "10.1.2.3",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "::1",
        "fc00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
        "224.0.0.1",
        "192.0.2.1",
        "64:ff9b::c0a8:101",
        "2002:7f00:1::1",
    ],
)
def test_every_dns_answer_must_be_public_even_when_another_answer_is_public(monkeypatch, ip):
    monkeypatch.setattr(w.socket, "getaddrinfo", lambda *a, **kw: [address(), address(ip)])
    with pytest.raises(DocumentError, match="source_url_forbidden"):
        w.public_addresses("example.com", 443)


def test_connection_pins_ip_but_preserves_hostname_for_tls(monkeypatch):
    events = []

    class Socket:
        def settimeout(self, value):
            pass

        def connect(self, target):
            events.append(("connect", target))

        def close(self):
            pass

    class TLS:
        def wrap_socket(self, sock, *, server_hostname):
            events.append(("sni", server_hostname))
            return sock

    monkeypatch.setattr(w.socket, "socket", lambda *a: Socket())
    monkeypatch.setattr(w.socket, "getaddrinfo", lambda *a: pytest.fail("second DNS lookup"))
    monkeypatch.setattr(w.ssl, "create_default_context", lambda: TLS())
    connection = w.PinnedConnection("example.com", 443, address(), secure=True, timeout=3)
    connection.connect()
    assert events == [("connect", ("93.184.216.34", 443)), ("sni", "example.com")]


class FakeResponse:
    def __init__(self, data=b"Hello", *, status=200, headers=None):
        self.status = status
        self.headers = Message()
        self.headers["Content-Type"] = "text/plain; charset=utf-8"
        for key, value in (headers or {}).items():
            self.headers[key] = value
        self.data = io.BytesIO(data)

    def getheader(self, name, default=None):
        return self.headers.get(name, default)

    def read(self, length):
        return self.data.read(length)

    def close(self):
        pass


def test_redirect_destination_is_resolved_and_rejected_before_connection(monkeypatch):
    contacted = []

    def resolve(host, *args, **kwargs):
        return [address("127.0.0.1" if host == "internal.test" else "93.184.216.34")]

    class Connection:
        def __init__(self, host, *args, **kwargs):
            contacted.append(host)

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            return FakeResponse(status=302, headers={"Location": "https://internal.test/secret"})

        def close(self):
            pass

    monkeypatch.setattr(w.socket, "getaddrinfo", resolve)
    monkeypatch.setattr(w, "PinnedConnection", Connection)
    with pytest.raises(DocumentError, match="source_url_forbidden"):
        w._fetch("https://public.test/")
    assert contacted == ["public.test"]


def test_gzip_expansion_and_unadvertised_stream_sizes_are_bounded(monkeypatch):
    monkeypatch.setattr(w, "MAX_FILE_BYTES", 1000)
    connection = type("Connection", (), {"sock": None})()
    for response in [
        FakeResponse(b"x" * 1001),
        FakeResponse(gzip.compress(b"x" * 10_000), headers={"Content-Encoding": "gzip"}),
    ]:
        with pytest.raises(DocumentError, match="source_file_too_large"):
            w._read_response(response, connection, w.time.monotonic() + 10)


def test_html_omits_executable_markup_and_retains_readable_title_and_text():
    text, title = w.html_text(
        b"<html><title>Readable title</title><script>steal()</script>"
        b"<style>secret</style><h1>Heading</h1><p>Hello &amp; goodbye</p></html>",
        "utf-8",
    )
    assert title == "Readable title"
    assert "Hello & goodbye" in text
    assert "steal" not in text and "secret" not in text
    with pytest.raises(DocumentError, match="source_no_text"):
        w.html_text(b"<script>onlyJavascript()</script>", "utf-8")


def test_html_text_over_limit_is_rejected_not_silently_truncated(monkeypatch):
    monkeypatch.setattr(w, "MAX_TEXT_CHARS", 20)
    with pytest.raises(DocumentError, match="source_text_too_large"):
        w.html_text(b"<p>" + b"a" * 21 + b"</p>", "utf-8")


def test_same_host_redirect_revalidates_dns_rebinding(monkeypatch):
    resolutions = []
    requests = []

    def resolve(host, *args, **kwargs):
        resolutions.append(host)
        return [address("93.184.216.34" if len(resolutions) == 1 else "10.1.2.3")]

    class Connection:
        def __init__(self, host, *args, **kwargs):
            requests.append(host)

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            return FakeResponse(status=302, headers={"Location": "/next"})

        def close(self):
            pass

    monkeypatch.setattr(w.socket, "getaddrinfo", resolve)
    monkeypatch.setattr(w, "PinnedConnection", Connection)
    with pytest.raises(DocumentError, match="source_url_forbidden"):
        w._fetch("https://public.test/")
    assert resolutions == ["public.test", "public.test"]
    assert requests == ["public.test"]


def test_redirects_are_bounded_and_https_never_downgrades(monkeypatch):
    requested = []
    destination = ["/another"]

    class Connection:
        def __init__(self, host, *args, **kwargs):
            requested.append(host)

        def request(self, *args, **kwargs):
            pass

        def getresponse(self):
            return FakeResponse(status=302, headers={"Location": destination[0]})

        def close(self):
            pass

    monkeypatch.setattr(w.socket, "getaddrinfo", lambda *a, **kw: [address()])
    monkeypatch.setattr(w, "PinnedConnection", Connection)
    with pytest.raises(DocumentError, match="source_web_redirects"):
        w._fetch("https://public.test/")
    assert len(requested) == w.MAX_REDIRECTS + 1
    destination[0] = "http://public.test/unsafe"
    with pytest.raises(DocumentError, match="source_url_forbidden"):
        w._fetch("https://public.test/")
