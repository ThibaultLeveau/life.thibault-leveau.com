"""Exercise assistant migration loss guards and constraints in real PostgreSQL."""

from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError

from life_app.cli import migration_config
from life_app.core.database import Base
from life_app.platform.assistant import models as m
from life_app.platform.auth.models import User

ASSISTANT_TABLES = tuple(
    table
    for table in Base.metadata.sorted_tables
    if table.name.startswith("assistant_")
    and table.name not in {"assistant_sources", "assistant_transcription_settings"}
)


def migrate(engine, direction, revision):
    with engine.begin() as connection:
        config = migration_config()
        config.attributes["connection"] = connection
        getattr(command, direction)(config, revision)


def snapshot(engine, tables):
    with engine.connect() as connection:
        return {
            table.name: connection.execute(
                text(f'SELECT to_jsonb(t) FROM "{table.name}" t ORDER BY to_jsonb(t)::text')
            )
            .scalars()
            .all()
            for table in tables
        }


def seed(app, target="all"):
    """Create the smallest graph containing a target table, or a complete conversation."""
    with app.state.sessions() as db, db.begin():
        user = db.scalar(select(User).where(User.username == "alice"))
        if target in {"all", "assistant_settings"}:
            db.add(m.AssistantSettings(user_id=user.id))
        if target in {"all", "assistant_memories"}:
            memory = m.Memory(user_id=user.id, content="Synthetic memory")
            db.add(memory)
        if target in {"assistant_settings", "assistant_memories"}:
            return
        conversation = m.Conversation(user_id=user.id, title="Synthetic migration")
        db.add(conversation)
        db.flush()
        if target == "assistant_conversations":
            return
        message = m.Message(
            user_id=user.id, conversation_id=conversation.id, role="assistant", content="Saved"
        )
        db.add(message)
        db.flush()
        if target == "all":
            memory.source_conversation_id = conversation.id
            memory.source_message_id = message.id
            memory.source_excerpt = "Synthetic source"
        if target == "assistant_messages":
            return
        run = m.Run(
            user_id=user.id,
            conversation_id=conversation.id,
            message_id=message.id,
            request_id=uuid4(),
            request_hash="a" * 64,
            status="complete",
            memory_version=1,
            session_hash="b" * 64,
        )
        db.add(run)
        db.flush()
        message.run_id = run.id
        if target in {"all", "assistant_operations"}:
            db.add(
                m.Operation(
                    user_id=user.id,
                    run_id=run.id,
                    step=1,
                    application_id="tasks",
                    action="create_task",
                    arguments={"title": "Synthetic"},
                    argument_hash="c" * 64,
                    precondition="synthetic-version",
                    status="complete",
                    result={"saved": True},
                )
            )
        if target in {"all", "assistant_run_events"}:
            db.add(m.RunEvent(run_id=run.id, sequence=1, data={"type": "done"}))


def test_assistant_migration_preserves_business_data_and_allows_empty_round_trip(
    app, authenticated_client, engine
):
    client = authenticated_client
    workspace = client.post("/api/v1/workspaces", json={"name": "Before assistant"})
    assert workspace.status_code == 201, workspace.text
    task = client.post(
        "/api/v1/tasks",
        json={"workspace_id": workspace.json()["id"], "title": "Preserved task"},
    )
    assert task.status_code == 201, task.text
    completed = client.post(
        f"/api/v1/tasks/{task.json()['id']}/complete",
        json={"expected_version": task.json()["version"]},
    )
    assert completed.status_code == 200, completed.text
    assert client.put("/api/v1/preferences", json={"locale": "en", "theme": "dark"}).is_success
    business_tables = [
        table for table in Base.metadata.sorted_tables if not table.name.startswith("assistant_")
    ]
    before = snapshot(engine, business_tables)
    try:
        migrate(engine, "downgrade", "0014_sport_ux")
        with engine.connect() as connection:
            assert not set(inspect(connection).get_table_names()) & {
                table.name for table in ASSISTANT_TABLES
            }
        assert snapshot(engine, business_tables) == before
    finally:
        migrate(engine, "upgrade", "head")
    assert snapshot(engine, business_tables) == before
    assert all(not rows for rows in snapshot(engine, ASSISTANT_TABLES).values())
    assert client.get(f"/api/v1/tasks/{task.json()['id']}").json() == completed.json()
    assert client.get("/api/v1/preferences").json() == {"locale": "en", "theme": "dark"}


@pytest.mark.parametrize("table", [table.name for table in ASSISTANT_TABLES])
def test_each_assistant_table_prevents_lossy_downgrade(app, engine, table):
    seed(app, table)
    before = snapshot(engine, ASSISTANT_TABLES)
    assert before[table]
    with pytest.raises(RuntimeError, match="Assistant data exists"):
        migrate(engine, "downgrade", "0014_sport_ux")
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT version_num FROM alembic_version"))
            == "0016_assistant_sources"
        )
    assert snapshot(engine, ASSISTANT_TABLES) == before
    migrate(engine, "upgrade", "head")
    assert snapshot(engine, ASSISTANT_TABLES) == before


@pytest.mark.parametrize(
    ("table", "column", "value", "sqlstate"),
    [
        ("assistant_settings", "provider", "untrusted", "23514"),
        ("assistant_settings", "memory_version", 0, "23514"),
        ("assistant_messages", "role", "system", "23514"),
        ("assistant_messages", "status", "invented", "23514"),
        ("assistant_runs", "status", "invented", "23514"),
        ("assistant_operations", "status", "invented", "23514"),
        ("assistant_messages", "conversation_id", uuid4(), "23503"),
        ("assistant_runs", "message_id", uuid4(), "23503"),
        ("assistant_operations", "run_id", uuid4(), "23503"),
        ("assistant_run_events", "run_id", uuid4(), "23503"),
        ("assistant_memories", "source_message_id", uuid4(), "23503"),
        ("assistant_memories", "source_conversation_id", uuid4(), "23503"),
    ],
)
def test_sql_constraints_reject_invalid_assistant_state(
    app, engine, table, column, value, sqlstate
):
    seed(app)
    before = snapshot(engine, ASSISTANT_TABLES)
    with pytest.raises(IntegrityError) as error, engine.begin() as connection:
        connection.execute(text(f'UPDATE "{table}" SET "{column}" = :value'), {"value": value})
    assert error.value.orig.sqlstate == sqlstate
    assert snapshot(engine, ASSISTANT_TABLES) == before


@pytest.mark.parametrize("model", [m.Run, m.Operation, m.RunEvent])
def test_idempotence_keys_are_unique_in_postgresql(app, engine, model):
    seed(app)
    with engine.connect() as connection:
        values = dict(connection.execute(select(model.__table__)).mappings().one())
    values["id"] = uuid4()
    with pytest.raises(IntegrityError) as error, engine.begin() as connection:
        connection.execute(model.__table__.insert().values(**values))
    assert error.value.orig.sqlstate == "23505"


def test_database_cascades_history_and_detaches_preserved_memories(app, engine):
    seed(app)
    with engine.begin() as connection:
        connection.execute(m.Conversation.__table__.delete())
    rows = snapshot(engine, ASSISTANT_TABLES)
    assert all(
        not contents
        for table, contents in rows.items()
        if table not in {"assistant_settings", "assistant_memories"}
    )
    memory = rows["assistant_memories"][0]
    assert memory["content"] == "Synthetic memory"
    assert memory["source_excerpt"] == "Synthetic source"
    assert memory["source_conversation_id"] is None and memory["source_message_id"] is None
    with engine.begin() as connection:
        connection.execute(User.__table__.delete().where(User.username == "alice"))
    assert all(not contents for contents in snapshot(engine, ASSISTANT_TABLES).values())
