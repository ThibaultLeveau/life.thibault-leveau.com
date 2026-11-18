"""Assistant HTTP surface, using the existing session and CSRF dependencies."""

from uuid import UUID

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from starlette.concurrency import iterate_in_threadpool

from life_app.apps.life_ai import execution, runtime, service
from life_app.apps.life_ai import models as m
from life_app.apps.life_ai import schemas as s
from life_app.apps.life_ai.messages import failure
from life_app.core.database import Database, utcnow
from life_app.platform.assistant import credentials
from life_app.platform.assistant.providers import ProviderError, ProviderSession
from life_app.platform.auth.service import CurrentUser

router = APIRouter(prefix="/assistant", tags=["Assistant"])


@router.get("/settings", response_model=s.SettingsOutput)
def get_settings(user: CurrentUser, db: Database):
    return service.settings_output(service.settings(db, user))


@router.put("/settings", response_model=s.SettingsOutput)
def put_settings(payload: s.SettingsInput, request: Request, user: CurrentUser, db: Database):
    result = service.update_settings(db, user, request.app.state.settings, payload)
    db.commit()
    return result


@router.post("/settings/test", response_model=s.CheckOutput)
def check_settings(request: Request, user: CurrentUser, db: Database):
    config = service.settings(db, user)
    token = credentials.decrypt(request.app.state.settings, config)
    if not config.model:
        raise failure(409, "assistant.provider_not_configured")
    provider, model = config.provider, config.model
    db.commit()
    factory = getattr(request.app.state, "assistant_provider_factory", ProviderSession)
    session = factory(
        provider,
        model,
        token,
        "Reply with OK only. Do not call tools.",
        [{"role": "user", "content": "Connection test"}],
    )
    try:
        for _ in session.respond([]):
            pass
    except ProviderError as error:
        raise failure(502, error.code) from None
    return {"ok": True}


@router.get("/capabilities", response_model=list[s.CapabilityOutput])
def get_capabilities(request: Request, user: CurrentUser, db: Database):
    return execution.capabilities(db, user, request.app.state.applications)


@router.get("/conversations", response_model=s.ConversationPage)
def get_conversations(
    user: CurrentUser,
    db: Database,
    q: str = Query("", max_length=160),
    archived: bool = False,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    return service.conversations(db, user, q, archived, offset, limit)


@router.post("/conversations", response_model=s.ConversationOutput, status_code=201)
def create_conversation(payload: s.ConversationInput, user: CurrentUser, db: Database):
    result = s.ConversationOutput.model_validate(
        service.create_conversation(db, user, payload.title)
    )
    db.commit()
    return result


@router.get("/conversations/{id}", response_model=s.ConversationDetail)
def get_conversation(
    id: UUID,
    request: Request,
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    service.interrupt_stale(db, user, request.app.state.settings.assistant_timeout_seconds)
    result = service.detail(db, user, id, offset, limit)
    db.commit()
    return result


@router.patch("/conversations/{id}", response_model=s.ConversationOutput)
def update_conversation(id: UUID, payload: s.ConversationUpdate, user: CurrentUser, db: Database):
    row = service.owned(db, user, m.Conversation, id)
    if payload.title is not None:
        row.title = payload.title
    if payload.archived is not None:
        row.archived = payload.archived
    row.updated_at = utcnow()
    result = s.ConversationOutput.model_validate(row)
    db.commit()
    return result


@router.delete("/conversations/{id}", status_code=204)
def delete_conversation(id: UUID, user: CurrentUser, db: Database, forget_memories: bool = False):
    service.delete_conversation(
        db, user, service.owned(db, user, m.Conversation, id), forget_memories
    )
    db.commit()
    return Response(status_code=204)


@router.post(
    "/conversations/{id}/messages",
    response_class=StreamingResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "Events: status, delta, message, error and done. Reusing "
            "request_id replays receipts without executing tools.",
        }
    },
)
def send_message(
    id: UUID, payload: s.SendMessage, request: Request, user: CurrentUser, db: Database
):
    service.interrupt_stale(db, user, request.app.state.settings.assistant_timeout_seconds)
    conversation = service.owned(db, user, m.Conversation, id)
    run, created = service.new_run(
        db, user, conversation, payload, request.state.login_session.token_hash
    )
    run_id = run.id
    if not created:
        events = [
            event.data
            for event in db.scalars(
                select(m.RunEvent).where(m.RunEvent.run_id == run_id).order_by(m.RunEvent.sequence)
            )
        ]
        db.commit()
        return StreamingResponse(
            (runtime.wire(event) for event in events),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )
    db.commit()  # Release the owner lock before the provider network call.

    async def events():
        generator = runtime.stream(request.app, run_id)
        try:
            async for event in iterate_in_threadpool(generator):
                if await request.is_disconnected():
                    break
                yield event
        finally:
            generator.close()

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/runs/{id}/events", response_class=StreamingResponse)
def run_events(
    id: UUID, request: Request, user: CurrentUser, db: Database, after: int = Query(0, ge=0)
):
    service.owned(db, user, m.Run, id)
    service.interrupt_stale(db, user, request.app.state.settings.assistant_timeout_seconds)
    events = [
        event.data
        for event in db.scalars(
            select(m.RunEvent)
            .where(m.RunEvent.run_id == id, m.RunEvent.sequence > after)
            .order_by(m.RunEvent.sequence)
            .limit(2000)
        )
    ]
    db.commit()
    return StreamingResponse(
        (runtime.wire(event) for event in events), media_type="text/event-stream"
    )


@router.post("/runs/{id}/cancel", response_model=s.CheckOutput)
def cancel(id: UUID, user: CurrentUser, db: Database):
    run = service.owned(db, user, m.Run, id)
    runtime.finish_run(db, run.id, "interrupted", error_code="assistant.run_interrupted")
    db.commit()
    return {"ok": True}


@router.post("/operations/{id}/confirm", response_model=s.OperationOutput)
def confirm(id: UUID, request: Request, user: CurrentUser, db: Database):
    result = execution.confirm(db, user, request.app.state.applications, id)
    db.commit()
    return result


@router.get("/memories", response_model=s.MemoryPage)
def get_memories(
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
):
    return service.memories(db, user, offset, limit)


@router.post("/memories", response_model=s.MemoryOutput, status_code=201)
def create_memory(payload: s.MemoryInput, user: CurrentUser, db: Database):
    result = s.MemoryOutput.model_validate(service.save_memory(db, user, payload))
    db.commit()
    return result


@router.patch("/memories/{id}", response_model=s.MemoryOutput)
def update_memory(id: UUID, payload: s.MemoryInput, user: CurrentUser, db: Database):
    row = service.owned(db, user, m.Memory, id)
    service.safe_memory(payload.content)
    row.content = payload.content
    row.source_conversation_id = None
    row.source_message_id = None
    row.source_excerpt = None
    if "category" in payload.model_fields_set:
        row.category = payload.category
    row.updated_at = utcnow()
    service.invalidate_memory_context(db, user)
    result = s.MemoryOutput.model_validate(row)
    db.commit()
    return result


@router.delete("/memories/{id}", status_code=204)
def forget_memory(id: UUID, user: CurrentUser, db: Database):
    db.delete(service.owned(db, user, m.Memory, id))
    service.invalidate_memory_context(db, user)
    db.commit()
    return Response(status_code=204)


@router.delete("/memories", status_code=204)
def forget_all(user: CurrentUser, db: Database):
    db.execute(delete(m.Memory).where(m.Memory.user_id == user.id))
    service.invalidate_memory_context(db, user)
    db.commit()
    return Response(status_code=204)


from life_app.apps.life_ai.source_routes import router as source_router  # noqa: E402
from life_app.apps.life_ai.transcription_routes import router as transcription_router  # noqa: E402

router.include_router(source_router)
router.include_router(transcription_router)
