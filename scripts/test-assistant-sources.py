#!/usr/bin/env python3
"""Acceptance of the packaged source API using synthetic data and no model calls."""

import hashlib
import http.cookiejar
import json
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
import zlib
from pathlib import Path


def png():
    def chunk(kind, data):
        return (
            struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data))
        )

    header = struct.pack("!IIBBBBB", 2, 2, 8, 2, 0, 0, 0)
    pixels = (b"\x00" + b"\x30\x90\xc0" * 2) * 2
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(pixels))
        + chunk(b"IEND", b"")
    )


def pdf():
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>",
        b"<< /Length 4 >>\nstream\nq\nQ\nendstream",
    ]
    result = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, content in enumerate(objects, 1):
        offsets.append(len(result))
        result.extend(f"{index} 0 obj\n".encode() + content + b"\nendobj\n")
    xref = len(result)
    result.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        result.extend(f"{offset:010d} 00000 n \n".encode())
    result.extend(f"trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(result)


def main(base_url, output):
    client = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    base = base_url + "/api/v1"
    csrf = ""

    def call(path, data=None, method="GET", media_type="application/json", expected=200):
        headers = {"Content-Type": media_type}
        if csrf:
            headers["X-CSRF-Token"] = csrf
        if data is not None and not isinstance(data, bytes):
            data = json.dumps(data).encode()
        request = urllib.request.Request(base + path, data=data, method=method, headers=headers)
        try:
            response = client.open(request, timeout=45)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            body = response.read()
            assert response.status == expected, (
                path,
                response.status,
                body.decode(errors="replace"),
            )
            return body, response.headers

    session, _ = call(
        "/auth/session",
        {
            "username": "browser-test",
            "password": "synthetic-browser-password",
        },
        "POST",
    )
    csrf = json.loads(session)["csrf_token"]
    limits, _ = call("/assistant/sources/limits")
    limits = json.loads(limits)
    assert limits["max_sources"] == 4 and limits["max_pdf_pages"] == 50
    assert {".txt", ".png", ".pdf"}.issubset(limits["accepted_extensions"])
    files = {
        "txt": ("restore-source.txt", b"Synthetic source preserved by restoration.", "text/plain"),
        "png": ("restore-source.png", png(), "image/png"),
        "pdf": ("restore-source.pdf", pdf(), "application/pdf"),
        "removed": ("restore-removed.txt", b"This original must be erased.", "text/plain"),
    }
    sources = {}
    for key, (name, data, media_type) in files.items():
        payload, _ = call(
            "/assistant/sources/files?" + urllib.parse.urlencode({"filename": name}),
            data,
            "POST",
            media_type,
            expected=201,
        )
        source = json.loads(payload)
        assert source["sha256"] == hashlib.sha256(data).hexdigest()
        assert source["media_type"] == media_type and "data" not in source
        path = "/assistant/sources/" + source["id"] + "/content"
        downloaded, headers = call(path)
        assert downloaded == data
        assert headers["Content-Disposition"].startswith("attachment;")
        assert headers["Cache-Control"] == "no-store"
        assert headers["X-Content-Type-Options"] == "nosniff"
        sources[key] = source
    call(
        "/assistant/sources/files?filename=spoof.png",
        b"This is not an image",
        "POST",
        "image/png",
        expected=422,
    )
    call("/assistant/sources/web", {"url": "http://127.0.0.1/internal"}, "POST", expected=422)
    removed_path = "/assistant/sources/" + sources["removed"]["id"]
    call(removed_path, method="DELETE", expected=204)
    call(removed_path + "/content", expected=410)
    settings, _ = call(
        "/assistant/transcription/settings",
        {
            "provider": "openai",
            "model": "synthetic-transcription-model",
            "use_chat_provider": False,
            "api_token": "synthetic-transcription-token-for-backup",
        },
        "PUT",
    )
    assert json.loads(settings)["configured"] and "api_token" not in json.loads(settings)
    Path(output).write_text(json.dumps(sources), encoding="utf-8")
    print("Packaged source API: text, image, PDF, removal, MIME and localhost guards verified.")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
