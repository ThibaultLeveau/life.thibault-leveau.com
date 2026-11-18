"""Sources, credentials and persistent confirmation guards survive schema operations."""

from uuid import uuid4

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from cryptography.fernet import Fernet
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from test_assistant_key_rotation import command as rotate
from test_assistant_key_rotation import configuration

from life_app.cli import migration_config
from life_app.platform.assistant import credentials
from life_app.platform.assistant import models as m
from life_app.platform.assistant.transcription_models import TranscriptionSettings
from life_app.platform.auth.models import User


def migrate(engine, direction, revision):
    with engine.begin() as connection:
        config = migration_config()
        config.attributes["connection"] = connection
        getattr(command, direction)(config, revision)


def source(user_id):
    return m.Source(
        user_id=user_id,
        kind="file",
        name="example.txt",
        media_type="text/plain",
        size_bytes=5,
        sha256="a" * 64,
        data=b"hello",
        extracted_text="hello",
    )


def test_empty_additive_migration_preserves_old_conversations(app, engine):
    with app.state.sessions() as db, db.begin():
        user = db.scalar(select(User).where(User.username == "alice"))
        conversation = m.Conversation(user_id=user.id, title="Preserved conversation")
        db.add(conversation)
        db.flush()
        id = conversation.id
    try:
        migrate(engine, "downgrade", "0015_assistant")
        with engine.connect() as connection:
            assert "assistant_sources" not in inspect(connection).get_table_names()
            assert (
                connection.scalar(
                    text("SELECT title FROM assistant_conversations WHERE id=:id"), {"id": id}
                )
                == "Preserved conversation"
            )
    finally:
        migrate(engine, "upgrade", "head")
    with app.state.sessions() as db:
        assert not db.get(m.Conversation, id).external_context


@pytest.mark.parametrize("kind", ["source", "transcription", "external_context"])
def test_multimodal_data_prevents_lossy_downgrade(app, engine, kind):
    with app.state.sessions() as db, db.begin():
        user = db.scalar(select(User).where(User.username == "alice"))
        if kind == "source":
            db.add(source(user.id))
        elif kind == "transcription":
            db.add(TranscriptionSettings(user_id=user.id))
        else:
            db.add(m.Conversation(user_id=user.id, title="External context", external_context=True))
    with pytest.raises(RuntimeError, match="Assistant data exists"):
        migrate(engine, "downgrade", "0015_assistant")
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT version_num FROM alembic_version"))
            == ScriptDirectory.from_config(migration_config()).get_current_head()
        )


@pytest.mark.parametrize(
    "values",
    [
        {"kind": "script"},
        {"size_bytes": 0},
        {"page_count": 0},
        {"conversation_id": uuid4()},
        {"removed_at": "2026-01-01T00:00:00Z"},
    ],
)
def test_source_database_constraints_reject_invalid_lifecycle(app, engine, values):
    with app.state.sessions() as db, db.begin():
        user = db.scalar(select(User).where(User.username == "alice"))
        db.add(source(user.id))
    column, value = next(iter(values.items()))
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text(f"UPDATE assistant_sources SET {column}=:value"), {"value": value})


def test_rotation_includes_separate_transcription_credential_and_is_atomic(
    app, engine, monkeypatch
):
    old, new = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    with app.state.sessions() as db, db.begin():
        user = db.scalar(select(User).where(User.username == "alice"))
        id = user.id
        for model, provider in (
            (m.AssistantSettings, "anthropic"),
            (TranscriptionSettings, "gemini"),
        ):
            db.add(
                model(
                    user_id=id,
                    provider=provider,
                    model="test",
                    ciphertext=credentials.encrypt(
                        configuration(old), id, provider, "synthetic-private-token"
                    ),
                )
            )
    rotate(monkeypatch, engine, configuration(new + "," + old))
    with app.state.sessions() as db:
        for model in (m.AssistantSettings, TranscriptionSettings):
            assert (
                credentials.decrypt(configuration(new), db.get(model, id))
                == "synthetic-private-token"
            )
    with app.state.sessions() as db, db.begin():
        row = db.get(TranscriptionSettings, id)
        row.ciphertext = "unreadable"
    with app.state.sessions() as db:
        before = db.get(m.AssistantSettings, id).ciphertext
    with pytest.raises(SystemExit):
        rotate(monkeypatch, engine, configuration(Fernet.generate_key().decode() + "," + new))
    with app.state.sessions() as db:
        assert db.get(m.AssistantSettings, id).ciphertext == before
