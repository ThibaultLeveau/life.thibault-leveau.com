"""Transcription endpoints: audio exists only for the duration of one request."""

import asyncio
import inspect
from datetime import timedelta
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from life_app.apps.life_ai import transcription
from life_app.apps.life_ai.access import require_enabled
from life_app.apps.life_ai.messages import failure
from life_app.apps.life_ai.transcription_models import TranscriptionSettings
from life_app.core.database import Database, utcnow
from life_app.platform.assistant import credentials
from life_app.platform.assistant.providers import ProviderError
from life_app.platform.auth.messages import tr as auth_tr
from life_app.platform.auth.models import LoginSession, User
from life_app.platform.auth.service import CurrentUser

router = APIRouter()


def reauthorize(db, user_id, session_hash):
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    session = db.get(LoginSession, session_hash, populate_existing=True)
    if (
        user is None
        or session is None
        or session.user_id != user_id
        or session.expires_at <= utcnow()
    ):
        raise HTTPException(401, auth_tr("your_session_has_expired_or_is_invalid"))
    require_enabled(db, user)
    return user


@router.get("/transcription/settings", response_model=transcription.SettingsOutput)
def get_settings(user: CurrentUser, db: Database):
    return transcription.output(db, user, transcription.settings(db, user))


@router.put("/transcription/settings", response_model=transcription.SettingsOutput)
def put_settings(
    payload: transcription.SettingsInput, request: Request, user: CurrentUser, db: Database
):
    result = transcription.update_settings(db, user, request.app.state.settings, payload)
    db.commit()
    return result


@router.post(
    "/transcription",
    response_model=transcription.Transcript,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
        }
    },
)
async def transcribe(
    request: Request,
    user: CurrentUser,
    db: Database,
    filename: str = Query(..., min_length=1, max_length=200),
):
    user_id, session_hash = user.id, request.state.login_session.token_hash
    if request.headers.get("content-encoding", "identity") != "identity":
        raise failure(422, "assistant.audio_format_invalid")
    try:
        length = int(request.headers.get("content-length", "0"))
    except ValueError:
        raise failure(422, "assistant.audio_format_invalid") from None
    if length > transcription.MAX_AUDIO_BYTES:
        raise failure(413, "assistant.audio_too_large")
    row = transcription.settings(db, user)
    selected, model = transcription.effective(db, user, row)
    if not selected or not selected.ciphertext or not model:
        raise failure(409, "assistant.transcription_not_configured")
    provider = selected.provider
    token = credentials.decrypt(request.app.state.settings, selected)
    language = user.locale
    now = utcnow()
    if row.lease_until and row.lease_until > now:
        raise failure(409, "assistant.transcription_in_progress")
    if row.period_start is None or row.period_start <= now - timedelta(hours=1):
        row.period_start, row.requests = now, 0
    if row.requests >= 30:
        raise failure(429, "assistant.transcription_rate_limit")
    lease_id = uuid4()
    row.lease_id, row.lease_until = lease_id, now + timedelta(seconds=180)
    row.requests += 1
    db.commit()
    factory = getattr(request.app.state, "assistant_transcriber", None)
    audio = bytearray()
    try:
        try:
            async with asyncio.timeout(30):
                async for chunk in request.stream():
                    if len(audio) + len(chunk) > transcription.MAX_AUDIO_BYTES:
                        raise failure(413, "assistant.audio_too_large")
                    audio.extend(chunk)
        except TimeoutError:
            raise failure(408, "assistant.transcription_timeout") from None
        media_type, safe_filename = transcription.audio_type(filename, audio)
        reauthorize(db, user_id, session_hash)
        db.commit()
        try:
            args = (provider, model, token, bytes(audio), media_type, safe_filename, language)
            if factory is None:
                result = await transcription.transcribe(*args)
            else:
                # Test-only injectable providers may be synchronous or asynchronous.
                result = await run_in_threadpool(factory, *args)
                if inspect.isawaitable(result):
                    result = await result
        except ProviderError as error:
            raise failure(502, error.code) from None
        if not isinstance(result, str) or len(result) > transcription.MAX_TRANSCRIPT_CHARS:
            raise failure(502, "assistant.transcript_too_long")
        reauthorize(db, user_id, session_hash)
        db.commit()
        return transcription.Transcript(text=result)
    finally:
        audio.clear()
        db.rollback()
        # Release only this request's lease, including after session revocation.
        # A fresh transaction also works when a provider failure rolled one back.
        with request.app.state.sessions() as cleanup, cleanup.begin():
            cleanup.scalar(select(User).where(User.id == user_id).with_for_update())
            current = cleanup.get(TranscriptionSettings, user_id)
            if current and current.lease_id == lease_id:
                current.lease_id = current.lease_until = None
