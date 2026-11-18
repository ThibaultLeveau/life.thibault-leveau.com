"""API parity for private document and explicit public-page imports."""

import asyncio
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response
from starlette.concurrency import run_in_threadpool

from life_app.core.database import Database
from life_app.platform.assistant import documents, sources, web_sources
from life_app.platform.assistant.messages import failure
from life_app.platform.assistant.source_schemas import SourceInput, SourceLimits, SourceOutput
from life_app.platform.auth.service import COOKIE, CurrentUser, current_user

router = APIRouter()


def reauthorize(request, db):
    db.expire_all()
    return current_user(
        request, db, request.cookies.get(COOKIE), request.headers.get("X-CSRF-Token")
    )


def source_failure(error):
    status = 413 if error.code.endswith("too_large") else 422
    if error.code in {"source_web_unavailable", "source_web_timeout"}:
        status = 502
    return failure(status, "assistant." + error.code)


@router.get("/sources/limits", response_model=SourceLimits)
def source_limits(request: Request, user: CurrentUser):
    return SourceLimits(storage_quota_bytes=request.app.state.settings.assistant_source_quota_bytes)


@router.post(
    "/sources/files",
    response_model=SourceOutput,
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
        }
    },
)
async def upload_source(
    request: Request,
    user: CurrentUser,
    db: Database,
    filename: str = Query(min_length=1, max_length=1000),
):
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > documents.MAX_FILE_BYTES:
                raise failure(413, "assistant.source_file_too_large")
        except ValueError:
            raise failure(422, "assistant.source_invalid_file") from None
    reservation = sources.reserve(db, user, request.app.state.settings, kind="file", name=filename)
    source_id = reservation.id
    db.commit()
    try:
        data = bytearray()
        async with asyncio.timeout(30):
            async for chunk in request.stream():
                if len(data) + len(chunk) > documents.MAX_FILE_BYTES:
                    raise failure(413, "assistant.source_file_too_large")
                data.extend(chunk)
        body = bytes(data)
        parsed = await run_in_threadpool(documents.parse_document, body, filename)
        if await request.is_disconnected():
            raise failure(400, "assistant.source_import_cancelled")
        user = reauthorize(request, db)
        row = sources.finish_import(db, user, request.app.state.settings, source_id, parsed, body)
        result = SourceOutput.model_validate(row)
        db.commit()
        return result
    except TimeoutError:
        sources.abandon(db, source_id)
        raise failure(408, "assistant.source_processing_failed") from None
    except documents.DocumentError as error:
        sources.abandon(db, source_id)
        raise source_failure(error) from None
    except BaseException:
        sources.abandon(db, source_id)
        raise


@router.post("/sources/web", response_model=SourceOutput, status_code=201)
async def import_web(payload: SourceInput, request: Request, user: CurrentUser, db: Database):
    try:
        url = web_sources.normalize_url(payload.url)
    except documents.DocumentError as error:
        raise source_failure(error) from None
    row = sources.reserve(db, user, request.app.state.settings, kind="web", name=url)
    source_id = row.id
    db.commit()
    try:
        parsed = await run_in_threadpool(web_sources.fetch_url, url)
        if await request.is_disconnected():
            raise failure(400, "assistant.source_import_cancelled")
        user = reauthorize(request, db)
        row = sources.finish_import(
            db, user, request.app.state.settings, source_id, parsed, parsed.data, url=parsed.url
        )
        result = SourceOutput.model_validate(row)
        db.commit()
        return result
    except documents.DocumentError as error:
        sources.abandon(db, source_id)
        raise source_failure(error) from None
    except BaseException:
        sources.abandon(db, source_id)
        raise


@router.get("/sources/{id}", response_model=SourceOutput)
def get_source(id: UUID, user: CurrentUser, db: Database):
    row = sources.owned(db, user, id)
    if row.removed_at is None and row.data is None:
        raise failure(409, "assistant.source_not_ready")
    return SourceOutput.model_validate(row)


@router.get("/sources/{id}/content", response_class=Response)
def download_source(id: UUID, user: CurrentUser, db: Database):
    row = sources.owned(db, user, id)
    if row.removed_at is not None:
        raise failure(410, "assistant.source_removed")
    if row.data is None:
        raise failure(409, "assistant.source_not_ready")
    name = row.name + (".txt" if row.kind == "web" and row.media_type == "text/plain" else "")
    return Response(
        content=row.data,
        media_type=row.media_type,
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''" + quote(name, safe=""),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
        },
    )


@router.delete("/sources/{id}", status_code=204)
def remove_source(id: UUID, user: CurrentUser, db: Database):
    sources.remove(db, user, id)
    db.commit()
    return Response(status_code=204)
