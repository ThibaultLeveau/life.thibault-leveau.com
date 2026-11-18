"""The only business execution boundary: authorization, short transaction and receipt."""

from datetime import timedelta
from uuid import uuid4

from fastapi.encoders import jsonable_encoder
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select

from life_app.core.database import utcnow
from life_app.core.i18n import request_context
from life_app.platform.applications.service import catalogue, find_application
from life_app.platform.assistant import common, service
from life_app.platform.assistant import models as m
from life_app.platform.assistant import schemas as s
from life_app.platform.assistant.definition import ActionContext
from life_app.platform.assistant.messages import failure
from life_app.platform.auth.models import LoginSession, User


def authorize(db, run_id, timeout, *, allow_complete=False):
    run = db.get(m.Run, run_id)
    if run is None:
        raise failure(404, "assistant.not_found")
    user = db.scalar(
        select(User)
        .where(User.id == run.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    db.refresh(run)
    session = db.get(LoginSession, run.session_hash, populate_existing=True)
    if session is None or session.user_id != user.id or session.expires_at <= utcnow():
        raise failure(401, "assistant.session_expired")
    if not allow_complete and (
        run.cancelled
        or run.status != "running"
        or run.created_at < utcnow() - timedelta(seconds=timeout)
    ):
        raise failure(409, "assistant.run_interrupted")
    config = service.settings(db, user)
    if config.memory_version != run.memory_version and not allow_complete:
        raise failure(409, "assistant.context_changed")
    return run, user


def action_for(db, user, definitions, application_id, name):
    if application_id == "lifeos":
        for action in common.provider.actions:
            if action.name == name:
                return action
        raise failure(404, "assistant.action_not_found")
    definition = find_application(definitions, application_id)
    if not next(
        item for item in catalogue(db, user, definitions) if item.id == application_id
    ).enabled:
        raise failure(
            403,
            "assistant.application_disabled",
            headers={"X-Life-Application-Disabled": application_id},
        )
    if definition.actions:
        for action in definition.actions.actions:
            if action.name == name:
                return action
    raise failure(404, "assistant.action_not_found")


def parsed(action, arguments):
    try:
        return action.input_model.model_validate(arguments)
    except ValidationError as error:
        # Never return Pydantic's raw input values (they may contain private data).
        raise failure(
            422,
            [
                {"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]}
                for item in error.errors(include_input=False, include_context=False)
            ],
        ) from None


def result_json(action, result):
    if action.output_model is not None:
        result = TypeAdapter(action.output_model).validate_python(result)
    return jsonable_encoder(result)


def action_label(action):
    return action.localized_label()


def snippet(operation, action, targets=None):
    preview = operation.status == "preview"
    data = {
        "title": action_label(action),
        "entity": operation.result,
        "read_only": not action.mutating,
    }
    if action.labels:
        data["labels"] = dict(zip(("fr", "en"), action.labels, strict=True))
    archived = operation.arguments.get("payload", {}).get("archived")
    if isinstance(archived, bool):
        data["effect"] = "archive" if archived else "restore"
    if preview:
        data["arguments"] = operation.arguments
    if targets:
        data["targets"] = targets
    return s.Snippet(
        id=operation.id,
        application_id=operation.application_id,
        kind=action.name,
        phase="preview" if preview else "result",
        operation_id=operation.id,
        data=data,
    )


def attach(db, run, card):
    message = db.get(m.Message, run.message_id)
    if (
        card.application_id == "lifeos"
        and card.phase == "result"
        and not any(item["id"] == str(card.id) for item in message.snippets)
    ):
        return
    cards = [item for item in message.snippets if item["id"] != str(card.id)]
    # Keep proposals and final changes; intermediate discovery reads need no growing wall.
    if card.phase == "result":
        cards = [
            item
            for item in cards
            if not (
                item["application_id"] == card.application_id
                and item["phase"] == "result"
                and item.get("data", {}).get("read_only")
            )
        ]
    message.snippets = cards + [card.model_dump(mode="json")]


def execute(app, run_id, step, scope, name, arguments, *, propose=False):
    with app.state.sessions() as db:
        run, user = authorize(db, run_id, app.state.settings.assistant_timeout_seconds)
        action = action_for(db, user, app.state.applications, scope, name)
        payload = parsed(action, arguments)
        normalized = payload.model_dump(mode="json", exclude_unset=True)
        digest = service.fingerprint(normalized)
        existing = db.scalar(
            select(m.Operation).where(m.Operation.run_id == run_id, m.Operation.step == step)
        )
        if existing:
            if (
                existing.argument_hash != digest
                or existing.action != name
                or existing.application_id != scope
            ):
                raise failure(409, "assistant.operation_conflict")
            return {
                "status": existing.status,
                "operation_id": str(existing.id),
                "result": existing.result,
            }
        context = ActionContext(db, user, app.state.applications)
        condition = action.precondition(context, payload) if action.precondition else None
        # External references can inject instructions into later turns too. The
        # persistent conversation flag, not the model's arguments, is authoritative.
        external_context = db.get(m.Conversation, run.conversation_id).external_context
        preview = action.mutating and (action.confirmation or propose or external_context)
        targets = action.preview_targets(context, payload) if action.preview_targets else None
        if preview:
            # Validate ownership and all business rules, then discard simulated writes.
            nested = db.begin_nested()
            try:
                result = result_json(action, action.handler(context, payload))
                db.flush()
            finally:
                nested.rollback()
        else:
            result = result_json(action, action.handler(context, payload))
            request = request_context.get()
            if request is not None:
                request.state.locale = user.locale
        operation = m.Operation(
            id=uuid4(),
            user_id=user.id,
            run_id=run_id,
            step=step,
            application_id=scope,
            action=name,
            arguments=normalized,
            argument_hash=digest,
            precondition=condition,
            status="preview" if preview else "complete",
            result=result,
        )
        db.add(operation)
        db.flush()
        card = snippet(operation, action, targets)
        attach(db, run, card)
        run.updated_at = utcnow()
        db.commit()
        return {
            "status": operation.status,
            "operation_id": str(operation.id),
            "result": result,
            "snippet": card.model_dump(mode="json"),
        }


def confirm(db, user, definitions, operation_id):
    operation = service.owned(db, user, m.Operation, operation_id)
    action = action_for(db, user, definitions, operation.application_id, operation.action)
    run = db.get(m.Run, operation.run_id)
    message = db.get(m.Message, run.message_id)
    targets = next(
        (
            item.get("data", {}).get("targets")
            for item in message.snippets
            if item["id"] == str(operation.id)
        ),
        None,
    )
    if operation.status == "complete":
        return s.OperationOutput(
            operation_id=operation.id,
            status=operation.status,
            result=operation.result,
            snippet=snippet(operation, action, targets),
        )
    if operation.status != "preview" or operation.created_at < utcnow() - timedelta(hours=24):
        raise failure(409, "assistant.preview_expired")
    payload = parsed(action, operation.arguments)
    context = ActionContext(db, user, definitions)
    if action.precondition and action.precondition(context, payload) != operation.precondition:
        raise failure(409, "assistant.preview_changed")
    operation.result = result_json(action, action.handler(context, payload))
    request = request_context.get()
    if request is not None:
        request.state.locale = user.locale
    operation.status = "complete"
    card = snippet(operation, action, targets)
    attach(db, run, card)
    db.flush()
    return s.OperationOutput(
        operation_id=operation.id, status=operation.status, result=operation.result, snippet=card
    )


def capabilities(db, user, definitions):
    active = {item.id for item in catalogue(db, user, definitions) if item.enabled}
    result = [
        s.CapabilityOutput(
            application_id=definition.id,
            name=action.name,
            label=action.localized_label(),
            description=action.description,
            input_schema=action.input_model.model_json_schema(),
            mutating=action.mutating,
            confirmation=action.confirmation,
            method=action.method,
            path=action.path,
        )
        for definition in definitions
        if definition.id in active and definition.actions
        for action in definition.actions.actions
    ]
    result.extend(
        s.CapabilityOutput(
            application_id="lifeos",
            name=action.name,
            label=action.localized_label(),
            description=action.description,
            input_schema=action.input_model.model_json_schema(),
            mutating=action.mutating,
            confirmation=action.confirmation,
            method=action.method,
            path=action.path,
        )
        for action in common.provider.actions
    )
    return result
