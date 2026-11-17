"""Owner-scoped persistence and memory lifecycle; never call providers with a DB open."""

import hashlib
import json
import re
from datetime import timedelta

from sqlalchemy import case, delete, func, select, update

from life_app.core.database import utcnow
from life_app.platform.assistant import credentials
from life_app.platform.assistant import models as m
from life_app.platform.assistant import schemas as s
from life_app.platform.assistant.messages import failure


def fingerprint(value) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


def owned(db, user, model, id):
    row = db.scalar(select(model).where(model.id == id, model.user_id == user.id))
    if row is None:
        raise failure(404, "assistant.not_found")
    return row


def settings(db, user):
    row = db.get(m.AssistantSettings, user.id)
    if row is None:
        row = m.AssistantSettings(user_id=user.id)
        db.add(row)
        db.flush()
    return row


def settings_output(row):
    return s.SettingsOutput(
        provider=row.provider,
        model=row.model,
        configured=bool(row.ciphertext),
        token_hint=row.token_hint,
        memory_enabled=row.memory_enabled,
    )


def invalidate_memory_context(db, user):
    row = settings(db, user)
    row.memory_version += 1
    row.memory_cutoff = utcnow()
    db.execute(
        update(m.Conversation)
        .where(m.Conversation.user_id == user.id)
        .values(summary="", summary_until=None)
    )


def update_settings(db, user, runtime_settings, payload):
    row = settings(db, user)
    if payload.provider is not None and payload.provider != row.provider:
        row.provider = payload.provider
        row.ciphertext = None
        row.token_hint = None
        row.model = ""
    if payload.model is not None:
        row.model = payload.model
    if "api_token" in payload.model_fields_set:
        if payload.api_token is None:
            row.ciphertext = None
            row.token_hint = None
        else:
            token = payload.api_token.get_secret_value()
            row.ciphertext = credentials.encrypt(runtime_settings, user.id, row.provider, token)
            row.token_hint = "••••" + token[-4:]
    if payload.memory_enabled is not None and payload.memory_enabled != row.memory_enabled:
        row.memory_enabled = payload.memory_enabled
        invalidate_memory_context(db, user)
    db.flush()
    return settings_output(row)


def conversations(db, user, q, archived, offset, limit):
    query = select(m.Conversation).where(
        m.Conversation.user_id == user.id, m.Conversation.archived == archived
    )
    if q:
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(
            m.Conversation.title.ilike(pattern, escape="\\")
            | m.Conversation.id.in_(
                select(m.Message.conversation_id).where(
                    m.Message.user_id == user.id, m.Message.content.ilike(pattern, escape="\\")
                )
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(m.Conversation.updated_at.desc(), m.Conversation.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return s.ConversationPage(items=rows, total=total)


def create_conversation(db, user, title):
    row = m.Conversation(
        user_id=user.id,
        title=title or ("Nouvelle conversation" if user.locale == "fr" else "New conversation"),
    )
    db.add(row)
    db.flush()
    return row


def interrupt_stale(db, user, timeout):
    from life_app.platform.assistant.runtime import finish_run
    from life_app.platform.auth.models import User

    # GET recovery and POST admission share the same short owner lock as writes.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    rows = db.scalars(
        select(m.Run).where(
            m.Run.user_id == user.id,
            (
                (m.Run.status == "running")
                & (m.Run.created_at < utcnow() - timedelta(seconds=timeout + 30))
            )
            | (
                (m.Run.status != "running")
                & ~select(m.RunEvent.id)
                .where(
                    m.RunEvent.run_id == m.Run.id,
                    m.RunEvent.data["type"].astext == "done",
                )
                .exists()
            ),
        )
    ).all()
    for row in rows:
        finish_run(
            db,
            row.id,
            "interrupted",
            error_code="assistant.run_interrupted" if row.status == "running" else None,
        )


def detail(db, user, id, offset=0, limit=100):
    conversation = owned(db, user, m.Conversation, id)
    rows = db.scalars(
        select(m.Message)
        .where(m.Message.conversation_id == id, m.Message.user_id == user.id)
        .order_by(m.Message.created_at.desc(), m.Message.id.desc())
        .offset(offset)
        .limit(limit + 1)
    ).all()
    return s.ConversationDetail(
        conversation=conversation, messages=list(reversed(rows[:limit])), has_more=len(rows) > limit
    )


def new_run(db, user, conversation, payload, session_hash):
    previous = db.scalar(
        select(m.Run).where(m.Run.user_id == user.id, m.Run.request_id == payload.request_id)
    )
    request_hash = fingerprint({"conversation": str(conversation.id), "content": payload.content})
    if previous:
        if previous.request_hash != request_hash:
            raise failure(409, "assistant.request_conflict")
        return previous, False
    if conversation.archived:
        raise failure(409, "assistant.conversation_archived")
    if db.scalar(select(m.Run.id).where(m.Run.user_id == user.id, m.Run.status == "running")):
        raise failure(409, "assistant.run_in_progress")
    config = settings(db, user)
    if not config.ciphertext or not config.model:
        raise failure(409, "assistant.provider_not_configured")
    if not db.scalar(
        select(m.Message.id).where(m.Message.conversation_id == conversation.id).limit(1)
    ):
        conversation.title = payload.content[:80]
    conversation.updated_at = utcnow()
    user_message = m.Message(
        user_id=user.id, conversation_id=conversation.id, role="user", content=payload.content
    )
    reply = m.Message(
        user_id=user.id, conversation_id=conversation.id, role="assistant", status="running"
    )
    db.add_all([user_message, reply])
    db.flush()
    row = m.Run(
        user_id=user.id,
        conversation_id=conversation.id,
        message_id=reply.id,
        request_id=payload.request_id,
        request_hash=request_hash,
        memory_version=config.memory_version,
        session_hash=session_hash,
    )
    db.add(row)
    db.flush()
    reply.run_id = row.id
    return row, True


def delete_conversation(db, user, row, forget_memories):
    if db.scalar(
        select(m.Run.id).where(m.Run.conversation_id == row.id, m.Run.status == "running")
    ):
        raise failure(409, "assistant.run_in_progress")
    if forget_memories:
        db.execute(
            delete(m.Memory).where(
                m.Memory.user_id == user.id, m.Memory.source_conversation_id == row.id
            )
        )
        invalidate_memory_context(db, user)
    db.delete(row)


def safe_memory(content):
    if re.search(
        r"(?:sk-[a-zA-Z0-9_-]{12,}|AIza[a-zA-Z0-9_-]{15,}|-----BEGIN .*PRIVATE KEY-----|"
        r"(?:api[_ -]?key|password|mot de passe|token)\s*[:=]\s*\S+)",
        content,
        re.I,
    ):
        raise failure(422, "assistant.memory_contains_secret")


def requires_memory_consent(content, category):
    """Conservative server guard in addition to the model's sensitivity classification."""
    if category not in {"profile", "profession", "projects", "preferences"}:
        return True
    return bool(
        re.search(
            r"\b(?:santé|health|malad\w*|illness|disease|diagnos\w*|cancer|diab[eè]t\w*|"
            r"traitement|medicat\w*|médica\w*|méd[eé]cin|doctor|th[eé]rap\w*|"
            r"d[eé]press\w*|anxi[eé]t\w*|mental|psychi\w*|handicap\w*|disabilit\w*|"
            r"sex\w*|intim\w*|gay|lesbian\w*|lesbien\w*|bisex\w*|transgenre|transgender|"
            r"relig\w*|politic\w*|politiq\w*|vote\w*|musulm\w*|muslim\w*|chr[eé]tien\w*|"
            r"christian\w*|juif\w*|jewish|ath[eé]e\w*|atheist\w*|"
            r"salaire|salary|revenus?|income|dettes?|debts?|banqu\w*|bank\w*|"
            r"financial|financi[eè]r\w*|passport|passeport|immigra\w*|ethni\w*|"
            r"grossesse|pregnan\w*|enceinte|fertilit\w*|criminal|judiciaire)\b",
            content,
            re.I,
        )
    )


def memories(db, user, offset=0, limit=100):
    query = select(m.Memory).where(m.Memory.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(m.Memory.updated_at.desc(), m.Memory.id).offset(offset).limit(limit)
    ).all()
    return s.MemoryPage(items=rows, total=total)


def save_memory(db, user, payload, source=None, excerpt=None):
    safe_memory(payload.content)
    existing = db.scalar(
        select(m.Memory).where(
            m.Memory.user_id == user.id, func.lower(m.Memory.content) == payload.content.casefold()
        )
    )
    if existing:
        return existing
    if (
        db.scalar(select(func.count()).select_from(m.Memory).where(m.Memory.user_id == user.id))
        >= 500
    ):
        raise failure(409, "assistant.memory_limit")
    row = m.Memory(
        user_id=user.id,
        content=payload.content,
        category=payload.category,
        source_conversation_id=source.conversation_id if source else None,
        source_message_id=source.id if source else None,
        source_excerpt=excerpt,
    )
    db.add(row)
    db.flush()
    return row


def relevant_memories(db, user, query, limit=40):
    """A small identity baseline plus query-relevant facts, not just the latest facts."""
    words = list(dict.fromkeys(re.findall(r"[\wÀ-ÿ]{3,}", query.casefold())))[:20]
    score = case((m.Memory.category.in_(["profile", "profession"]), 2), else_=0)
    for word in words:
        pattern = "%" + word.replace("_", "\\_") + "%"
        score = score + case((m.Memory.content.ilike(pattern, escape="\\"), 5), else_=0)
    return db.scalars(
        select(m.Memory)
        .where(m.Memory.user_id == user.id)
        .order_by(score.desc(), m.Memory.updated_at.desc(), m.Memory.id)
        .limit(limit)
    ).all()
