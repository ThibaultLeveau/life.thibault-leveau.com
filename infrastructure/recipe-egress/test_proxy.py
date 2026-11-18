"""Network admission and IP pinning, without a public dependency."""

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

import proxy


class Admission(unittest.TestCase):
    def test_denied_addresses(self):
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.169.254",
            "172.17.0.1",
            "192.168.1.1",
            "100.64.1.1",
            "0.0.0.0",
            "224.0.0.1",
            "::1",
            "fe80::1",
            "fc00::1",
            "::ffff:8.8.8.8",
            "2002:0808:0808::1",
            "2001::1",
        ]:
            with self.subTest(address=address):
                self.assertFalse(proxy.public_address(address))
        self.assertTrue(proxy.public_address("8.8.8.8"))
        self.assertTrue(proxy.public_address("2606:4700:4700::1111"))

    def test_invalid_destinations(self):
        for target in [
            "http://user:pass@example.org",
            "file:///etc/passwd",
            "http://a:22",
            "http://a/\r\nHost:evil",
            "http://a\\@b",
            "http://[fe80::1%eth0]",
            "http://a/#fragment",
        ]:
            with self.subTest(target=target), self.assertRaises(ValueError):
                proxy.destination(target)
        for target in ["a:443/path", "a:22", "user@a:443"]:
            with self.subTest(target=target), self.assertRaises(ValueError):
                proxy.destination(target, True)
        self.assertEqual(proxy.destination("https.example:443", True)[:2], ("https.example", 443))


class Resolution(unittest.IsolatedAsyncioTestCase):
    async def test_all_addresses_checked_and_own_host_denied(self):
        loop = asyncio.get_running_loop()
        for ips in [("8.8.8.8", "127.0.0.1"), ("8.8.8.8", "169.254.169.254"), ("1.1.1.1",)]:
            with (
                patch.object(
                    loop,
                    "getaddrinfo",
                    AsyncMock(return_value=[(2, 1, 6, "", (ip, 443)) for ip in ips]),
                ),
                patch.object(proxy, "DENIED", {"1.1.1.1"}),
            ):
                with self.assertRaises(ValueError):
                    await proxy.addresses("example.org", 443)

    async def test_connection_pinned_to_resolved_ip(self):
        reader = asyncio.StreamReader()
        reader.feed_data(b"CONNECT example.org:443 HTTP/1.1\r\n\r\n")
        reader.feed_eof()
        writer = unittest.mock.Mock()
        writer.drain = AsyncMock()
        incoming = asyncio.StreamReader()
        incoming.feed_eof()
        upstream = unittest.mock.Mock()
        upstream.drain = AsyncMock()
        with (
            patch.object(proxy, "addresses", AsyncMock(return_value=["8.8.8.8"])),
            patch.object(
                asyncio, "open_connection", AsyncMock(return_value=(incoming, upstream))
            ) as connect,
        ):
            await proxy.exchange(reader, writer)
            connect.assert_awaited_once_with("8.8.8.8", 443, limit=65536)
            self.assertIn(b"200 Connection Established", writer.write.call_args_list[0].args[0])
