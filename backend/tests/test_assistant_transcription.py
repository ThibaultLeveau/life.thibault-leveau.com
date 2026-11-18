"""Dictation is transient, owner-scoped, bounded and never executes chat actions."""

import asyncio
import io
import json
import wave
from datetime import timedelta

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import delete, func, select

from life_app.apps.life_ai import models as m
from life_app.apps.life_ai import transcription as t
from life_app.apps.life_ai.transcription_models import TranscriptionSettings
from life_app.core.database import utcnow
from life_app.platform.assistant.providers import ProviderError
from life_app.platform.auth.models import LoginSession

PREFIX = "/api/v1/assistant"
TOKEN = "synthetic-transcription-private-token"


def wav():
    output = io.BytesIO()
    with wave.open(output, "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(16000)
        recording.writeframes(b"\0\0" * 160)
    return output.getvalue()


@pytest.fixture
def client(app, authenticated_client, life_ai_enabled):
    app.state.settings.assistant_encryption_keys = SecretStr(Fernet.generate_key().decode())
    response = authenticated_client.put(
        PREFIX + "/settings",
        json={
            "provider": "openai",
            "model": "test-chat",
            "api_token": TOKEN,
        },
    )
    assert response.status_code == 200, response.text
    return authenticated_client


def test_reuses_chat_credential_and_returns_editable_text_without_persistence(app, client):
    calls = []

    def transcriber(*args):
        calls.append(args)
        return "Un brouillon à relire."

    app.state.assistant_transcriber = transcriber
    config = client.get(PREFIX + "/transcription/settings").json()
    assert config["configured"] and config["use_chat_provider"]
    assert config["model"] == "gpt-transcribe"
    assert TOKEN not in json.dumps(config)
    response = client.post(PREFIX + "/transcription?filename=voice.wav", content=wav())
    assert response.status_code == 200, response.text
    assert response.json() == {"text": "Un brouillon à relire."}
    assert calls[0][:3] == ("openai", "gpt-transcribe", TOKEN)
    assert calls[0][-1] == "fr"
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.Message)) == 0
        assert db.scalar(select(func.count()).select_from(m.Source)) == 0
        config = db.scalar(select(TranscriptionSettings))
        assert config.requests == 1 and config.lease_id is None and config.lease_until is None


def test_anthropic_requires_explicit_compatible_transcription_configuration(app, client):
    assert (
        client.put(
            PREFIX + "/settings",
            json={"provider": "anthropic", "model": "test", "api_token": TOKEN},
        ).status_code
        == 200
    )
    assert not client.get(PREFIX + "/transcription/settings").json()["configured"]
    assert (
        client.post(PREFIX + "/transcription?filename=voice.wav", content=wav()).status_code == 409
    )
    response = client.put(
        PREFIX + "/transcription/settings",
        json={
            "provider": "gemini",
            "model": "test-audio",
            "use_chat_provider": False,
            "api_token": "synthetic-separate-token",
        },
    )
    assert response.status_code == 200 and response.json()["configured"]
    assert "synthetic-separate-token" not in response.text
    app.state.assistant_transcriber = lambda *args: args[0] + ":" + args[1]
    assert client.post(PREFIX + "/transcription?filename=voice.wav", content=wav()).json() == {
        "text": "gemini:test-audio"
    }
    with app.state.sessions() as db:
        row = db.scalar(select(TranscriptionSettings))
        assert "synthetic-separate-token" not in row.ciphertext
    assert (
        client.put(PREFIX + "/transcription/settings", json={"api_token": None}).json()[
            "configured"
        ]
        is False
    )


def test_transcription_credentials_are_owner_scoped_and_csrf_protected(app, client):
    client.put(
        PREFIX + "/transcription/settings",
        json={"use_chat_provider": False, "model": "own", "api_token": TOKEN},
    )
    with TestClient(app) as bob:
        response = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        assert response.status_code == 200
        assert not bob.get(PREFIX + "/transcription/settings").json()["configured"]
        assert bob.post(PREFIX + "/transcription?filename=a.wav", content=wav()).status_code == 403
    assert (
        client.put(PREFIX + "/transcription/settings", json={"provider": "arbitrary"}).status_code
        == 422
    )
    assert (
        client.put(
            PREFIX + "/transcription/settings", json={"provider": "openai", "extra": "secret"}
        ).status_code
        == 422
    )


def test_bad_audio_and_oversize_never_call_provider(app, client, monkeypatch):
    app.state.assistant_transcriber = lambda *args: pytest.fail("Invalid audio reached provider")
    assert (
        client.post(PREFIX + "/transcription?filename=voice.wav", content=b"not audio").status_code
        == 422
    )
    assert (
        client.post(PREFIX + "/transcription?filename=voice.exe", content=wav()).status_code == 422
    )
    monkeypatch.setattr(t, "MAX_AUDIO_BYTES", 30)
    assert (
        client.post(PREFIX + "/transcription?filename=voice.wav", content=wav()).status_code == 413
    )


@pytest.mark.parametrize("revoke", ["logout", "life_ai"])
def test_provider_failure_releases_lease_and_session_is_revalidated(app, client, revoke):
    def failed(*args):
        raise ProviderError("assistant.provider_quota")

    app.state.assistant_transcriber = failed
    assert (
        client.post(PREFIX + "/transcription?filename=voice.wav", content=wav()).status_code == 502
    )
    with app.state.sessions() as db:
        assert db.scalar(select(TranscriptionSettings)).lease_id is None

    def expired(*args):
        with app.state.sessions() as db, db.begin():
            if revoke == "logout":
                db.execute(delete(LoginSession))
            else:
                from sqlalchemy import text

                db.execute(
                    text(
                        "UPDATE application_preferences SET enabled=false "
                        "WHERE application_id='life_ai'"
                    )
                )
        return "This private text must not be returned"

    app.state.assistant_transcriber = expired
    response = client.post(PREFIX + "/transcription?filename=voice.wav", content=wav())
    assert response.status_code == (401 if revoke == "logout" else 403)
    assert "private text" not in response.text
    with app.state.sessions() as db:
        assert db.scalar(select(TranscriptionSettings)).lease_id is None


def test_admission_rate_and_concurrency_are_enforced_before_provider(app, client):
    app.state.assistant_transcriber = lambda *args: pytest.fail("Admission limit bypassed")
    client.put(PREFIX + "/transcription/settings", json={})
    with app.state.sessions() as db, db.begin():
        row = db.scalar(select(TranscriptionSettings))
        row.lease_until = utcnow() + timedelta(minutes=1)
    assert (
        client.post(PREFIX + "/transcription?filename=voice.wav", content=wav()).status_code == 409
    )
    with app.state.sessions() as db, db.begin():
        row = db.scalar(select(TranscriptionSettings))
        row.lease_until = None
        row.period_start, row.requests = utcnow(), 30
    assert (
        client.post(PREFIX + "/transcription?filename=voice.wav", content=wav()).status_code == 429
    )


@pytest.mark.parametrize("provider", ["openai", "gemini"])
def test_native_provider_payload_is_audio_only_and_has_no_tools(provider):
    def handle(request):
        assert request.method == "POST"
        assert request.headers.get(
            "authorization", request.headers.get("x-goog-api-key", "")
        ).endswith(TOKEN)
        if provider == "openai":
            assert request.url.host == "api.openai.com"
            assert b'name="file"' in request.content and b"RIFF" in request.content
            assert b'name="language"' in request.content
            return httpx.Response(200, json={"text": "Bonjour."})
        payload = json.loads(request.content)
        assert request.url.host == "generativelanguage.googleapis.com"
        assert "tools" not in payload
        assert payload["contents"][0]["parts"][0]["inlineData"]["mimeType"] == "audio/wav"
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"finishReason": "STOP", "content": {"parts": [{"text": "Bonjour."}]}}
                ]
            },
        )

    assert (
        asyncio.run(
            t.transcribe(
                provider,
                "test",
                TOKEN,
                wav(),
                "audio/wav",
                "a.wav",
                "fr",
                transport=httpx.MockTransport(handle),
            )
        )
        == "Bonjour."
    )


@pytest.mark.parametrize(
    "response,code",
    [
        (httpx.Response(429), "assistant.provider_quota"),
        (
            httpx.Response(302, headers={"location": "https://untrusted.invalid"}),
            "assistant.provider_unavailable",
        ),
        (httpx.Response(200, json={"text": "x" * 12001}), "assistant.transcript_too_long"),
        (httpx.Response(200, content=b"invalid-json"), "assistant.provider_unavailable"),
    ],
)
def test_provider_errors_are_bounded_and_do_not_expose_upstream_content(response, code):
    with pytest.raises(ProviderError) as caught:
        asyncio.run(
            t.transcribe(
                "openai",
                "test",
                TOKEN,
                wav(),
                "audio/wav",
                "a.wav",
                "en",
                transport=httpx.MockTransport(lambda request: response),
            )
        )
    assert caught.value.code == code


def test_raw_uploads_are_described_as_binary_in_openapi(app):
    paths = app.openapi()["paths"]
    for route in ("/sources/files", "/transcription"):
        upload = paths[PREFIX + route]["post"]["requestBody"]
        assert upload["required"] is True
        assert upload["content"]["application/octet-stream"]["schema"]["format"] == "binary"


def test_reusing_chat_preserves_independent_provider_configuration(client):
    saved = client.put(
        PREFIX + "/transcription/settings",
        json={
            "provider": "gemini",
            "model": "custom-audio",
            "use_chat_provider": False,
            "api_token": "synthetic-separate-token",
        },
    ).json()
    assert saved["custom_provider"] == "gemini"
    reuse = client.put(PREFIX + "/transcription/settings", json={"use_chat_provider": True}).json()
    assert reuse["provider"] == "openai" and reuse["model"] == "gpt-transcribe"
    assert reuse["custom_provider"] == "gemini" and reuse["custom_model"] == "custom-audio"
    assert reuse["custom_configured"] and reuse["custom_token_hint"]
    custom = client.put(
        PREFIX + "/transcription/settings", json={"use_chat_provider": False}
    ).json()
    assert custom["configured"] and custom["provider"] == "gemini"
    assert custom["model"] == "custom-audio"


class SlowTranscriptionTransport(httpx.AsyncBaseTransport):
    """A provider can stall during upload, before headers or after a body fragment."""

    def __init__(self, phase):
        self.phase = phase
        self.active = False
        self.cancelled = False
        self.closed = False
        self.body_closed = False

    async def stall(self):
        self.active = True
        try:
            await asyncio.Event().wait()
        finally:
            self.cancelled = True
            self.active = False

    async def handle_async_request(self, request):
        if self.phase == "upload":
            async for _ in request.stream:
                await self.stall()
        await request.aread()
        if self.phase == "headers":
            await self.stall()
        owner = self

        class Body(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b'{"text":"unfinished'
                await owner.stall()

            async def aclose(self):
                owner.body_closed = True

        return httpx.Response(200, stream=Body())

    async def aclose(self):
        self.closed = True


@pytest.mark.parametrize("phase", ["upload", "headers", "body"])
def test_total_deadline_cancels_network_and_releases_lease(app, client, monkeypatch, phase):
    transport = SlowTranscriptionTransport(phase)
    production_transcribe = t.transcribe
    monkeypatch.setattr(t, "TRANSCRIPTION_TIMEOUT", 0.02)

    async def slow_provider(*args):
        # Fail promptly even if the production deadline regresses.
        return await asyncio.wait_for(production_transcribe(*args, transport=transport), timeout=1)

    monkeypatch.setattr(t, "transcribe", slow_provider)
    response = client.post(PREFIX + "/transcription?filename=voice.wav", content=wav())
    assert response.status_code == 502, response.text
    assert response.json()["code"] == "assistant.transcription_timeout"
    assert transport.cancelled and transport.closed and not transport.active
    if phase == "body":
        assert transport.body_closed
    with app.state.sessions() as db:
        row = db.scalar(select(TranscriptionSettings))
        assert row.lease_id is None and row.lease_until is None
    app.state.assistant_transcriber = lambda *args: "A subsequent recording works."
    assert client.post(PREFIX + "/transcription?filename=voice.wav", content=wav()).json() == {
        "text": "A subsequent recording works."
    }


def test_caller_cancellation_closes_provider_without_swallowing_cancellation():
    transport = SlowTranscriptionTransport("body")

    async def cancel():
        task = asyncio.create_task(
            t.transcribe(
                "openai", "test", TOKEN, wav(), "audio/wav", "voice.wav", "fr", transport=transport
            )
        )
        async with asyncio.timeout(1):
            while not transport.active:
                await asyncio.sleep(0)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

    asyncio.run(cancel())
    assert transport.cancelled and transport.closed and transport.body_closed
    assert not transport.active
