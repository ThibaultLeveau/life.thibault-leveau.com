"""Bounded HTTP/CONNECT proxy: resolve once, validate every IP, connect to that IP.

The browser network has no Internet route. This service has no LifeOS credentials
or database connection. Do not log destinations, cookies or request content.
"""

import asyncio
import ipaddress
import os
import socket
from urllib.parse import urlsplit

MAX_BYTES = 16 * 1024 * 1024
CONNECTION_SECONDS = 120
CAPACITY = asyncio.Semaphore(64)
DENIED = set()


def public_address(value):
    address = ipaddress.ip_address(value)
    if not address.is_global or any(
        (address.is_multicast, address.is_reserved, address.is_unspecified, address.is_loopback)
    ):
        return False
    if address.version == 6:
        return (
            address in ipaddress.ip_network("2000::/3")
            and not address.sixtofour
            and not address.teredo
            and not address.ipv4_mapped
        )
    return True


def destination(target, tunnel=False):
    if any(ord(char) <= 32 or ord(char) == 127 for char in target) or "\\" in target:
        raise ValueError("invalid URL")
    url = urlsplit("https://" + target if tunnel else target)
    if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password:
        raise ValueError("invalid URL")
    if url.fragment or (tunnel and (url.path or url.query)):
        raise ValueError("invalid URL")
    port = url.port or (443 if url.scheme == "https" else 80)
    if port not in {80, 443} or (not tunnel and url.scheme != "http"):
        raise ValueError("invalid port")
    host = url.hostname.rstrip(".").encode("idna").decode("ascii").lower()
    if not host or len(host) > 253 or "%" in host:
        raise ValueError("invalid host")
    return host, port, (url.path or "/") + ("?" + url.query if url.query else "")


async def addresses(host, port):
    records = await asyncio.wait_for(
        asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM), 5
    )
    result = list(dict.fromkeys(row[4][0] for row in records))
    if not result or any(not public_address(ip) or ip in DENIED for ip in result):
        raise ValueError("destination denied")
    return result


async def relay(reader, writer):
    total = 0
    while chunk := await asyncio.wait_for(reader.read(65536), 30):
        total += len(chunk)
        if total > MAX_BYTES:
            raise ValueError("transfer limit")
        writer.write(chunk)
        await writer.drain()


async def refresh_denied():
    hosts = os.environ.get("LIFE_RECIPE_BLOCKED_HOSTS", "life.thibault-leveau.com").split(",")
    values = set(filter(None, os.environ.get("LIFE_RECIPE_DENIED_IPS", "").split(",")))
    for host in hosts:
        records = await asyncio.wait_for(
            asyncio.get_running_loop().getaddrinfo(host.strip(), 443, type=socket.SOCK_STREAM), 5
        )
        values.update(row[4][0] for row in records)
    DENIED.clear()
    DENIED.update(values)


async def exchange(reader, writer):
    upstream = None
    tasks = []
    started = False
    try:
        async with asyncio.timeout(8):
            header = await reader.readuntil(b"\r\n\r\n")
        lines = header.decode("latin-1").split("\r\n")
        method, target, version = lines[0].split(" ")
        if version not in {"HTTP/1.0", "HTTP/1.1"}:
            raise ValueError("invalid request")
        if method == "GET" and target == "/health":
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
            await writer.drain()
            return
        if method not in {"CONNECT", "GET", "HEAD", "POST", "OPTIONS"}:
            raise ValueError("invalid method")
        tunnel = method == "CONNECT"
        host, port, path = destination(target, tunnel)
        resolved = await addresses(host, port)
        # IP literal is used here: no second DNS lookup / DNS rebinding window.
        incoming, upstream = await asyncio.wait_for(
            asyncio.open_connection(resolved[0], port, limit=65536), 8
        )
        if tunnel:
            writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await writer.drain()
        else:
            headers = []
            for line in lines[1:]:
                if not line:
                    continue
                key, value = line.split(":", 1)
                if not key or key.strip() != key or not key.isascii():
                    raise ValueError("invalid header")
                if key.lower() not in {
                    "host",
                    "connection",
                    "proxy-connection",
                    "proxy-authorization",
                    "upgrade",
                }:
                    headers.append(key + ":" + value)
            authority = "[" + host + "]" if ":" in host else host
            upstream.write(
                (
                    f"{method} {path} HTTP/1.1\r\nHost: {authority}:{port}\r\n"
                    + "\r\n".join(headers)
                    + "\r\nConnection: close\r\n\r\n"
                ).encode("latin-1")
            )
            await upstream.drain()
        started = True
        tasks = [
            asyncio.create_task(relay(reader, upstream)),
            asyncio.create_task(relay(incoming, writer)),
        ]
        async with asyncio.timeout(CONNECTION_SECONDS):
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
    except (
        ValueError,
        OSError,
        TimeoutError,
        UnicodeError,
        asyncio.IncompleteReadError,
        asyncio.LimitOverrunError,
    ):
        if not started:
            try:
                writer.write(
                    b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
                await writer.drain()
            except OSError:
                pass
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if upstream:
            upstream.close()
        writer.close()


async def handle(reader, writer):
    try:
        async with asyncio.timeout(1):
            await CAPACITY.acquire()
    except TimeoutError:
        writer.close()
        return
    try:
        await exchange(reader, writer)
    finally:
        CAPACITY.release()


async def main():
    await refresh_denied()  # Fail closed when the host exclusion cannot be resolved.
    server = await asyncio.start_server(handle, "0.0.0.0", 3128, limit=32768)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
