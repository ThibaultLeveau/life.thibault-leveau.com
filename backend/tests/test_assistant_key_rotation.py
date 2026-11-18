"""Operational credentials and restore safeguards use synthetic data only."""

import sys
from pathlib import Path
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import func, select, text

from life_app import cli
from life_app.apps.life_ai import models as m
from life_app.core.config import Settings
from life_app.platform.assistant import credentials
from life_app.platform.auth.models import LoginSession, User


def configuration(keys):
    return Settings(
        _env_file=None,
        database_url="postgresql+psycopg://unused-for-injected-test-engine",
        assistant_encryption_keys=keys,
    )


def saved_token(app, config):
    with app.state.sessions() as db, db.begin():
        user = db.scalar(select(User).where(User.username == "alice"))
        row = m.AssistantSettings(
            user_id=user.id,
            provider="openai",
            model="synthetic-model",
            ciphertext=credentials.encrypt(config, user.id, "openai", "synthetic-private-token"),
        )
        db.add(row)
        db.flush()
        return user.id, row.ciphertext


def command(monkeypatch, engine, config, *options):
    monkeypatch.setattr(cli, "get_settings", lambda: config)
    monkeypatch.setattr(cli, "create_engine", lambda url: engine)
    monkeypatch.setattr(sys, "argv", ["life", "rotate-assistant-key", "alice", *options])
    cli.main()


def test_key_rotation_dry_run_and_new_key_only_decryption(app, engine, monkeypatch, capsys):
    old_key, new_key = Fernet.generate_key().decode(), Fernet.generate_key().decode()
    old_config = configuration(old_key)
    combined = configuration(new_key + "," + old_key)
    user_id, ciphertext = saved_token(app, old_config)
    command(monkeypatch, engine, combined, "--dry-run")
    with app.state.sessions() as db:
        assert db.get(m.AssistantSettings, user_id).ciphertext == ciphertext
    command(monkeypatch, engine, combined)
    with app.state.sessions() as db:
        row = db.get(m.AssistantSettings, user_id)
        assert row.ciphertext != ciphertext
        assert credentials.decrypt(configuration(new_key), row) == "synthetic-private-token"
        with pytest.raises(HTTPException):
            credentials.decrypt(old_config, row)
    output = capsys.readouterr()
    assert "synthetic-private-token" not in output.out + output.err
    assert old_key not in output.out + output.err
    assert new_key not in output.out + output.err


def test_rotation_failure_preserves_ciphertext(app, engine, monkeypatch, capsys):
    old_config = configuration(Fernet.generate_key().decode())
    user_id, ciphertext = saved_token(app, old_config)
    with pytest.raises(SystemExit) as error:
        command(monkeypatch, engine, configuration(Fernet.generate_key().decode()))
    assert error.value.code == 2
    with app.state.sessions() as db:
        assert db.get(m.AssistantSettings, user_id).ciphertext == ciphertext
    assert "synthetic-private-token" not in capsys.readouterr().err


def test_restore_suffix_interrupts_runs_invalidates_previews_and_preserves_receipts(
    app, authenticated_client, engine
):
    config = configuration(Fernet.generate_key().decode())
    user_id, ciphertext = saved_token(app, config)
    with app.state.sessions() as db, db.begin():
        conversation = m.Conversation(user_id=user_id, title="Synthetic restore")
        db.add(conversation)
        db.flush()
        reply = m.Message(
            user_id=user_id, conversation_id=conversation.id, role="assistant", status="running"
        )
        db.add(reply)
        db.flush()
        run = m.Run(
            user_id=user_id,
            conversation_id=conversation.id,
            message_id=reply.id,
            request_id=uuid4(),
            request_hash="0" * 64,
            memory_version=1,
            session_hash="0" * 64,
        )
        db.add(run)
        db.flush()
        reply.run_id = run.id
        preview = m.Operation(
            user_id=user_id,
            run_id=run.id,
            step=1,
            application_id="tasks",
            action="archive",
            arguments={},
            argument_hash="1" * 64,
            status="preview",
            result={"value": "preview"},
        )
        complete = m.Operation(
            user_id=user_id,
            run_id=run.id,
            step=2,
            application_id="tasks",
            action="create",
            arguments={},
            argument_hash="2" * 64,
            status="complete",
            result={"value": "saved"},
        )
        memory = m.Memory(user_id=user_id, content="Synthetic memory", category="projects")
        db.add_all([preview, complete, memory])
        db.flush()
        ids = run.id, reply.id, preview.id, complete.id, memory.id
    with engine.begin() as connection:
        schema = connection.scalar(text("SELECT current_schema()"))
        suffix = (Path(__file__).parents[2] / "scripts/restore-suffix.sql").read_text()
        connection.exec_driver_sql(suffix.replace("public.", f'"{schema}".'))
    with app.state.sessions() as db:
        run = db.get(m.Run, ids[0])
        assert run.status == "interrupted" and run.cancelled
        assert db.get(m.Message, ids[1]).status == "interrupted"
        assert db.get(m.Operation, ids[2]).status == "failed"
        assert db.get(m.Operation, ids[3]).status == "complete"
        assert db.get(m.Operation, ids[3]).result == {"value": "saved"}
        assert db.get(m.Memory, ids[4]).content == "Synthetic memory"
        row = db.get(m.AssistantSettings, user_id)
        assert row.ciphertext == ciphertext
        assert credentials.decrypt(config, row) == "synthetic-private-token"
        assert db.scalar(select(func.count()).select_from(LoginSession)) == 0
