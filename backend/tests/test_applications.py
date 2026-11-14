"""Account activation, HTTP access parity, preservation, constraints and migration."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import UUID, uuid4

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import event, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from test_tasks import create_space, create_task, history, mutate

from life_app.apps.registry import APPLICATIONS
from life_app.cli import migration_config
from life_app.platform.applications.models import ApplicationPreference
from life_app.platform.auth.models import User


@pytest.fixture
def client(authenticated_client):
    return authenticated_client


def toggle(client, enabled):
    response = client.put("/api/v1/applications/tasks", json={"enabled": enabled})
    assert response.status_code == 200, response.text
    return response.json()


def test_catalogue_defaults_and_idempotence(client, engine):
    response = client.get("/api/v1/applications")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert [(a["id"], a["enabled"]) for a in response.json()] == [("tasks", True), ("sport", False)]
    assert response.json()[0]["updated_at"] is None
    off = toggle(client, False)
    assert not off["enabled"] and off["updated_at"]
    assert toggle(client, False) == off
    on = toggle(client, True)
    assert on["enabled"] and on["updated_at"] > off["updated_at"]
    assert toggle(client, True) == on
    with Session(engine) as db:
        assert len(db.scalars(select(ApplicationPreference)).all()) == 1


def test_activation_auth_validation_and_owner_isolation(client, app):
    with TestClient(app) as guest:
        assert guest.get("/api/v1/applications").status_code == 401
        assert guest.put("/api/v1/applications/tasks", json={"enabled": False}).status_code == 401
        guest.cookies.update(dict(client.cookies))
        assert guest.put("/api/v1/applications/tasks", json={"enabled": False}).status_code == 403
    assert (
        client.put(
            "/api/v1/applications/tasks",
            json={"enabled": False},
            headers={"Origin": "https://evil.example"},
        ).status_code
        == 403
    )
    for payload in (
        {},
        {"enabled": None},
        {"enabled": "false"},
        {"enabled": 0},
        {"enabled": False, "user_id": str(uuid4())},
    ):
        assert client.put("/api/v1/applications/tasks", json=payload).status_code == 422
    assert client.put("/api/v1/applications/unknown", json={"enabled": True}).status_code == 404
    toggle(client, False)
    with TestClient(app) as bob:
        result = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        assert result.status_code == 200
        bob.headers["X-CSRF-Token"] = result.json()["csrf_token"]
        assert bob.get("/api/v1/applications").json()[0]["enabled"]
        assert bob.get("/api/v1/tasks").status_code == 200
        toggle(bob, False)
        toggle(bob, True)
    assert not client.get("/api/v1/applications").json()[0]["enabled"]


def test_every_registered_business_route_is_guarded(client):
    for definition in APPLICATIONS:
        assert (
            client.put(f"/api/v1/applications/{definition.id}", json={"enabled": False}).status_code
            == 200
        )
        for route in definition.router.routes:
            path = route.path
            for name in route.param_convertors:
                path = path.replace("{" + name + "}", str(uuid4()))
            for method in route.methods:
                response = client.request(method, "/api/v1" + path, json={})
                assert response.status_code == 403, (method, path, response.text)
                assert response.headers["X-Life-Application-Disabled"] == definition.id
    assert client.get("/api/v1/preferences").status_code == 200
    assert client.get("/api/v1/auth/session").status_code == 200
    assert client.get("/api/v1/health/ready").status_code == 200
    assert client.get("/api/v1/tasks/nonexistent/extra").status_code == 404
    schema = client.get("/api/openapi.json").json()
    assert schema["paths"]["/api/v1/applications"]["get"]["security"]
    assert schema["paths"]["/api/v1/applications/{application_id}"]["put"]["security"]


def test_deactivation_preserves_data_history_preferences_and_session(client):
    space, _ = create_space(client)
    item = create_task(
        client, space, recurrence={"rrule": "FREQ=DAILY", "start_date": "2090-01-01"}
    )
    item = mutate(client, item, "complete")
    events = history(client, item)
    prefs = client.put("/api/v1/agenda/view", json={"period": "week"}).json()
    theme = client.put("/api/v1/preferences", json={"theme": "dark"}).json()
    toggle(client, False)
    assert client.get(f"/api/v1/tasks/{item['id']}").status_code == 403
    toggle(client, True)
    assert client.get(f"/api/v1/tasks/{item['id']}").json() == item
    assert history(client, item) == events
    assert client.get("/api/v1/agenda/view").json() == prefs
    assert client.get("/api/v1/preferences").json() == theme


def test_activation_migration_preserves_existing_data_and_refuses_loss(client, engine):
    space, _ = create_space(client)
    item = mutate(client, create_task(client, space), "complete")
    events = history(client, item)
    with engine.begin() as connection:
        config = migration_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "0004_recurrence")
        command.upgrade(config, "head")
    assert client.get("/api/v1/applications").json()[0]["enabled"]
    assert client.get(f"/api/v1/tasks/{item['id']}").json() == item
    assert history(client, item) == events
    toggle(client, False)
    with pytest.raises(RuntimeError, match="Activations présentes"), engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0004_recurrence")
    assert not client.get("/api/v1/applications").json()[0]["enabled"]


def test_activation_database_constraints(client, engine):
    user_id = UUID(client.get("/api/v1/auth/session").json()["user_id"])
    for owner, app_id, enabled in (
        (uuid4(), "tasks", True),
        (user_id, "../invalid", True),
        (user_id, "tasks", None),
    ):
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(
                text("INSERT INTO application_preferences VALUES (:user, :app, :enabled, now())"),
                {"user": owner, "app": app_id, "enabled": enabled},
            )
    toggle(client, False)
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(
            text("INSERT INTO application_preferences SELECT * FROM application_preferences")
        )
    with pytest.raises(IntegrityError), engine.begin() as connection:
        connection.execute(text("UPDATE application_preferences SET updated_at=NULL"))


def test_business_write_waits_for_activation_transaction(client, engine, app):
    """A write queued behind deactivation sees the new state after acquiring the owner lock."""
    user_id = UUID(client.get("/api/v1/auth/session").json()["user_id"])
    waiting = Event()

    def before_execute(conn, cursor, statement, parameters, context, executemany):
        if "FROM users" in statement and "FOR UPDATE" in statement:
            waiting.set()

    def create_after_lock():
        with TestClient(app) as other:
            other.cookies.update(dict(client.cookies))
            return other.post(
                "/api/v1/workspaces",
                json={"name": "Écriture bloquée"},
                headers={"X-CSRF-Token": client.headers["X-CSRF-Token"]},
            )

    with Session(engine) as db:
        db.scalar(select(User).where(User.id == user_id).with_for_update())
        db.add(ApplicationPreference(user_id=user_id, application_id="tasks", enabled=False))
        db.flush()
        event.listen(engine, "before_cursor_execute", before_execute)
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(create_after_lock)
                try:
                    assert waiting.wait(10), "La requête doit atteindre le verrou utilisateur"
                    assert not future.done()
                finally:
                    db.commit()
                assert future.result(timeout=10).status_code == 403
        finally:
            event.remove(engine, "before_cursor_execute", before_execute)
    toggle(client, True)
    assert client.get("/api/v1/workspaces").json() == []
