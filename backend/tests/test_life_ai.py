"""Life AI activation, shared configuration and migration preserve the existing graph."""

import pytest
from alembic import command
from cryptography.fernet import Fernet
from pydantic import SecretStr
from sqlalchemy import select, text
from test_assistant_migration import ASSISTANT_TABLES, seed, snapshot

from life_app.apps.life_ai import models as m
from life_app.cli import migration_config
from life_app.platform.applications.models import ApplicationPreference
from life_app.platform.assistant import structured
from life_app.platform.auth.models import User


def test_shared_provider_works_without_life_ai_and_preserves_private_settings(
    app, authenticated_client, engine
):
    client = authenticated_client
    assert client.get("/api/v1/assistant/settings").status_code == 403
    app.state.settings.assistant_encryption_keys = SecretStr(Fernet.generate_key().decode())
    response = client.put(
        "/api/v1/assistant/provider-settings",
        json={"provider": "openai", "model": "synthetic", "api_token": "synthetic-provider-key"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["configured"]
    assert "memory_enabled" not in response.json() and "api_token" not in response.json()
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        assert (
            structured.configuration(db, user, app.state.settings).token == "synthetic-provider-key"
        )
    assert client.put("/api/v1/applications/life_ai", json={"enabled": True}).is_success
    settings = client.put("/api/v1/assistant/settings", json={"memory_enabled": False}).json()
    chat = client.post("/api/v1/assistant/conversations", json={"title": "Preserved"}).json()
    client.post(
        "/api/v1/assistant/memories", json={"content": "My project", "category": "projects"}
    )
    source = client.post(
        "/api/v1/assistant/sources/files?filename=private.txt", content=b"Private reference"
    )
    assert source.status_code == 201, source.text
    tables = [
        table for table in m.Base.metadata.sorted_tables if table.name.startswith("assistant_")
    ]
    before = snapshot(engine, tables)
    assert client.put("/api/v1/applications/life_ai", json={"enabled": False}).is_success
    assert client.get(f"/api/v1/assistant/conversations/{chat['id']}").status_code == 403
    assert client.get("/api/v1/assistant/provider-settings").json() == response.json()
    assert snapshot(engine, tables) == before
    assert client.put("/api/v1/applications/life_ai", json={"enabled": True}).is_success
    assert client.get("/api/v1/assistant/settings").json() == settings
    assert (
        client.get(f"/api/v1/assistant/conversations/{chat['id']}").json()["conversation"] == chat
    )
    assert (
        client.get(f"/api/v1/assistant/sources/{source.json()['id']}/content").content
        == b"Private reference"
    )
    assert snapshot(engine, tables) == before


def test_life_ai_migration_preserves_data_and_explicit_activation(
    app, engine, authenticated_client
):
    assert authenticated_client.put(
        "/api/v1/applications/tasks", json={"enabled": False}
    ).is_success
    preferences_before = snapshot(engine, [ApplicationPreference.__table__])[
        "application_preferences"
    ]
    seed(app)
    before = snapshot(engine, ASSISTANT_TABLES)
    with engine.begin() as conn:
        config = migration_config()
        config.attributes["connection"] = conn
        command.downgrade(config, "0018_recipe_web_import")
        # A preference explicitly set by a prior compatible deployment wins over migration.
        conn.execute(
            text(
                "INSERT INTO application_preferences SELECT id, 'life_ai', false, now() "
                "FROM users WHERE username='bob'"
            )
        )
        command.upgrade(config, "head")
    assert snapshot(engine, ASSISTANT_TABLES) == before
    assert [
        row
        for row in snapshot(engine, [ApplicationPreference.__table__])["application_preferences"]
        if row["application_id"] != "life_ai"
    ] == preferences_before
    with app.state.sessions() as db:
        users = {u.username: u.id for u in db.scalars(select(User))}
        assert db.get(ApplicationPreference, (users["alice"], "life_ai")).enabled
        assert not db.get(ApplicationPreference, (users["bob"], "life_ai")).enabled
        db.add(User(username="new-after-migration", password_hash="synthetic"))
        db.commit()
        new = db.scalar(select(User).where(User.username == "new-after-migration"))
        assert db.get(ApplicationPreference, (new.id, "life_ai")) is None
    assert authenticated_client.get("/api/v1/assistant/conversations").json()["total"] == 1
    with pytest.raises(RuntimeError, match="Life AI disabled"), engine.begin() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "0018_recipe_web_import")
    assert snapshot(engine, ASSISTANT_TABLES) == before


def test_shared_settings_are_owner_scoped_and_do_not_accept_memory(app, authenticated_client):
    from fastapi.testclient import TestClient

    client = authenticated_client
    assert client.put(
        "/api/v1/assistant/provider-settings", json={"model": "alice-model"}
    ).is_success
    assert (
        client.put(
            "/api/v1/assistant/provider-settings", json={"memory_enabled": False}
        ).status_code
        == 422
    )
    with TestClient(app) as bob:
        assert bob.get("/api/v1/assistant/provider-settings").status_code == 401
        assert bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        ).is_success
        assert bob.get("/api/v1/assistant/provider-settings").json()["model"] == ""
        assert (
            bob.put("/api/v1/assistant/provider-settings", json={"model": "bob"}).status_code == 403
        )
    assert client.get("/api/v1/assistant/provider-settings").json()["model"] == "alice-model"
