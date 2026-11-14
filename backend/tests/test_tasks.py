"""Exercise the real PostgreSQL schema, sessions and task API over HTTP."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from life_app.cli import migration_config
from life_app.core.config import Settings
from life_app.core.database import Base, utcnow
from life_app.features.auth.models import LoginSession, User
from life_app.features.auth.service import hasher
from life_app.features.tasks.models import Task
from life_app.main import create_app

PASSWORD = "synthetic-test-password"
PASSWORD_HASH = hasher.hash(PASSWORD)


@pytest.fixture(scope="module")
def engine():
    url = os.environ.get("LIFE_TEST_DATABASE_URL")
    if not url:
        pytest.fail("Run make test, or supply LIFE_TEST_DATABASE_URL for an isolated test schema")
    schema = "life_test_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        with engine.begin() as conn:
            config = migration_config()
            config.attributes["connection"] = conn
            command.upgrade(config, "head")
        yield engine
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def app(engine):
    with engine.begin() as conn:
        names = ", ".join(f'"{name}"' for name in Base.metadata.tables)
        conn.execute(text(f"TRUNCATE {names} CASCADE"))
    with Session(engine) as db, db.begin():
        db.add_all([User(username=name, password_hash=PASSWORD_HASH) for name in ("alice", "bob")])
    app = create_app(
        Settings(
            _env_file=None,
            environment="test",
            database_url=None,
            public_base_url="http://testserver",
        )
    )
    app.state.sessions = sessionmaker(engine, expire_on_commit=False)
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/session", json={"username": "alice", "password": PASSWORD}
        )
        assert response.status_code == 200, response.text
        client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        yield client


def create_space(client, name="Personnel"):
    response = client.post("/api/v1/workspaces", json={"name": name})
    assert response.status_code == 201, response.text
    space = response.json()
    statuses = client.get(f"/api/v1/workspaces/{space['id']}/statuses").json()
    return space, statuses


def create_section(client, space, name="Maison", **kwargs):
    response = client.post(
        f"/api/v1/workspaces/{space['id']}/sections", json={"name": name, **kwargs}
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_task(client, space, title="Préparer le dossier", **kwargs):
    response = client.post(
        "/api/v1/tasks", json={"workspace_id": space["id"], "title": title, **kwargs}
    )
    assert response.status_code == 201, response.text
    return response.json()


def mutate(client, item, action):
    response = client.post(
        f"/api/v1/tasks/{item['id']}/{action}", json={"expected_version": item["version"]}
    )
    assert response.status_code == 200, response.text
    return response.json()


def history(client, item):
    response = client.get(f"/api/v1/tasks/{item['id']}/events")
    assert response.status_code == 200
    return response.json()["items"]


def test_recurring_task_complete_undo_end_and_history(client, monkeypatch):
    from datetime import UTC, datetime

    from life_app.features.tasks import service

    monkeypatch.setattr(service, "utcnow", lambda: datetime(2026, 11, 14, 12, tzinfo=UTC))
    space, _ = create_space(client)
    item = create_task(
        client,
        space,
        recurrence={"rrule": "FREQ=DAILY", "start_date": "2026-11-14", "max_occurrences": 2},
    )
    assert item["due_date"] == "2026-11-14"
    advanced = mutate(client, item, "complete")
    assert advanced["due_date"] == "2026-11-15"
    assert advanced["completed_at"] is None
    assert advanced["recurrence_completed"] == 1
    assert advanced["version"] == item["version"] + 1
    assert (
        client.post(
            f"/api/v1/tasks/{item['id']}/complete", json={"expected_version": item["version"]}
        ).status_code
        == 409
    )
    events = history(client, item)
    assert [event["kind"] for event in events] == ["created", "completed", "rescheduled"]
    assert events[1]["context"]["before"]["due_date"] == "2026-11-14"
    assert events[1]["context"]["after"]["completed_at"] is not None
    assert events[2]["context"]["completion_event_id"] == events[1]["id"]
    undone = mutate(client, advanced, "undo-complete")
    assert undone["due_date"] == "2026-11-14"
    assert undone["recurrence_completed"] == 0
    assert history(client, item)[-1]["kind"] == "completion_undone"
    assert (
        client.post(
            f"/api/v1/tasks/{item['id']}/undo-complete",
            json={"expected_version": undone["version"]},
        ).status_code
        == 409
    )
    advanced = mutate(client, undone, "complete")
    final = mutate(client, advanced, "complete")
    assert final["completed_at"] is not None
    assert final["recurrence_completed"] == 2
    assert mutate(client, final, "complete")["version"] == final["version"]
    archived = client.patch(
        f"/api/v1/tasks/{item['id']}", json={"expected_version": final["version"], "archived": True}
    ).json()
    restored = client.patch(
        f"/api/v1/tasks/{item['id']}",
        json={"expected_version": archived["version"], "archived": False},
    ).json()
    assert restored["recurrence"] == item["recurrence"]
    assert restored["recurrence_completed"] == 2
    assert restored["completed_at"] == final["completed_at"]


@pytest.mark.parametrize("route", ["patch", "move"])
def test_recurring_status_changes_use_same_transition(client, route):
    space, statuses = create_space(client)
    item = create_task(
        client, space, recurrence={"rrule": "FREQ=WEEKLY;BYDAY=MO,TH", "start_date": "2090-01-01"}
    )
    destination = {
        "status_id": next(s["id"] for s in statuses if s["is_completed"]),
        "expected_version": item["version"],
    }
    if route == "patch":
        response = client.patch(f"/api/v1/tasks/{item['id']}", json=destination)
    else:
        response = client.post(
            f"/api/v1/tasks/{item['id']}/move", json={**destination, "workspace_id": space["id"]}
        )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["completed_at"] is None
    assert result["due_date"] > item["due_date"]
    assert result["recurrence_completed"] == 1


def test_schedule_api_parity_validation_and_literal_titles(client, app):
    payload = {"text": "Sport tous les lundis", "today": "2026-11-14", "timezone": "Europe/Paris"}
    parsed = client.post("/api/v1/scheduling/parse", json=payload)
    assert parsed.status_code == 200
    parsed = parsed.json()
    preview = client.post("/api/v1/scheduling/preview", json={"recurrence": parsed["recurrence"]})
    assert preview.status_code == 200
    assert preview.json()["dates"] == parsed["dates"]
    space, _ = create_space(client)
    item = create_task(
        client,
        space,
        title=parsed["title"],
        due_date=parsed["due_date"],
        recurrence=parsed["recurrence"],
    )
    assert item["recurrence"] == parsed["recurrence"]
    assert create_task(client, space, title="Lire demain")["due_date"] is None
    undated = create_task(client, space, title="Commencer une série")
    enabled = client.patch(
        f"/api/v1/tasks/{undated['id']}",
        json={
            "expected_version": undated["version"],
            "recurrence": parsed["recurrence"],
            "due_date": parsed["due_date"],
            "label_ids": [],
        },
    )
    assert enabled.status_code == 200, enabled.text
    for invalid in [
        {"due_date": None},
        {"recurrence": {**parsed["recurrence"], "rrule": "FREQ=HOURLY"}},
        {"recurrence": {**parsed["recurrence"], "timezone": "Mars/Olympus"}},
        {"recurrence": {**parsed["recurrence"], "end_date": "2020-01-01"}},
    ]:
        response = client.patch(
            f"/api/v1/tasks/{item['id']}", json={**invalid, "expected_version": item["version"]}
        )
        assert response.status_code == 422, response.text
    assert client.get(f"/api/v1/tasks/{item['id']}").json()["version"] == item["version"]
    cleared = client.patch(
        f"/api/v1/tasks/{item['id']}",
        json={"recurrence": None, "due_date": None, "expected_version": item["version"]},
    )
    assert cleared.status_code == 200
    assert cleared.json()["recurrence"] is None
    with TestClient(app) as other:
        assert other.post("/api/v1/scheduling/parse", json=payload).status_code == 401
        login = other.post("/api/v1/auth/session", json={"username": "bob", "password": PASSWORD})
        other.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        assert (
            other.post(
                f"/api/v1/tasks/{item['id']}/complete", json={"expected_version": 1}
            ).status_code
            == 404
        )


def test_schema_matches_models_and_migration_roundtrip(engine, app):
    with engine.begin() as conn:
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []
        config = migration_config()
        config.attributes["connection"] = conn
        command.downgrade(config, "base")
        command.upgrade(config, "head")
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []


def test_recurrence_migration_preserves_data_and_refuses_loss(client, engine):
    space, _ = create_space(client)
    item = mutate(client, create_task(client, space, due_date="2026-12-31"), "complete")
    original_events = history(client, item)
    with engine.begin() as connection:
        config = migration_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "0003_agenda")
        assert (
            connection.scalar(
                text("SELECT due_date::text FROM tasks WHERE id=:id"), {"id": item["id"]}
            )
            == "2026-12-31"
        )
        command.upgrade(config, "head")
    assert client.get(f"/api/v1/tasks/{item['id']}").json() == item
    assert history(client, item) == original_events
    recurring = create_task(
        client, space, recurrence={"rrule": "FREQ=DAILY", "start_date": "2026-12-31"}
    )
    with pytest.raises(RuntimeError, match="Récurrences présentes"), engine.begin() as connection:
        config = migration_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "0003_agenda")
    assert client.get(f"/api/v1/tasks/{recurring['id']}").json() == recurring
    with engine.begin() as connection:
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []


def test_recurrence_constraints_and_concurrent_completion(client, app, engine):
    space, _ = create_space(client)
    item = create_task(
        client, space, recurrence={"rrule": "FREQ=DAILY", "start_date": "2090-01-01"}
    )
    for statement in [
        "UPDATE tasks SET due_date=NULL WHERE id=:id",
        "UPDATE tasks SET recurrence_completed=-1 WHERE id=:id",
        "UPDATE tasks SET recurrence='[]'::jsonb WHERE id=:id",
    ]:
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text(statement), {"id": item["id"]})
    cookie = dict(client.cookies)
    csrf = client.headers["X-CSRF-Token"]

    def complete():
        with TestClient(app) as other:
            other.cookies.update(cookie)
            return other.post(
                f"/api/v1/tasks/{item['id']}/complete",
                headers={"X-CSRF-Token": csrf},
                json={"expected_version": item["version"]},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: complete(), range(2)))
    assert sorted(results) == [200, 409]
    result = client.get(f"/api/v1/tasks/{item['id']}").json()
    assert result["due_date"] == "2090-01-02"
    assert result["recurrence_completed"] == 1
    assert [event["kind"] for event in history(client, item)] == [
        "created",
        "completed",
        "rescheduled",
    ]


def test_complete_reopen_history_and_idempotency(client):
    space, _ = create_space(client)
    item = create_task(client, space)
    completed = mutate(client, item, "complete")
    same = mutate(client, completed, "complete")
    assert same["version"] == completed["version"]
    assert same["completed_at"] == completed["completed_at"]
    reopened = mutate(client, same, "reopen")
    assert reopened["completed_at"] is None
    final = mutate(client, reopened, "complete")
    events = history(client, final)
    assert [e["kind"] for e in events] == ["created", "completed", "reopened", "completed"]
    assert events[2]["was_completed"] and not events[2]["is_completed"]
    assert all(e["occurred_at"].endswith("Z") for e in events)


def test_cross_space_move_copies_labels_and_preserves_snapshot(client):
    first, _ = create_space(client, "Ancien nom")
    second, statuses = create_space(client, "Destination")
    section = create_section(client, second)
    label = client.post(f"/api/v1/workspaces/{first['id']}/labels", json={"name": "travail"}).json()
    item = create_task(client, first, label_ids=[label["id"]])
    client.patch(f"/api/v1/workspaces/{first['id']}", json={"name": "Nouveau nom"})
    response = client.post(
        f"/api/v1/tasks/{item['id']}/move",
        json={
            "expected_version": item["version"],
            "workspace_id": second["id"],
            "section_id": section["id"],
            "status_id": statuses[-1]["id"],
        },
    )
    assert response.status_code == 200, response.text
    moved = response.json()
    assert moved["workspace_id"] == second["id"] and moved["completed_at"]
    assert moved["label_ids"] != [label["id"]] and len(moved["label_ids"]) == 1
    events = history(client, moved)
    assert events[0]["context"]["after"]["workspace_name"] == "Ancien nom"
    assert [e["kind"] for e in events] == ["created", "completed", "moved"]
    assert events[-1]["context"]["before"]["workspace_id"] == first["id"]


def test_foreign_references_and_transaction_rollback(client, engine):
    a, statuses = create_space(client)
    b, _ = create_space(client, "Autre")
    section = create_section(client, b)
    invalid = client.post(
        "/api/v1/tasks",
        json={
            "title": "Interdit",
            "workspace_id": a["id"],
            "section_id": section["id"],
        },
    )
    assert invalid.status_code == 404
    assert client.get("/api/v1/tasks").json()["total"] == 0
    with Session(engine) as db:
        db.add(
            Task(
                workspace_id=UUID(a["id"]),
                section_id=UUID(section["id"]),
                status_id=UUID(statuses[0]["id"]),
                title="Direct SQL",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
    assert client.get("/api/v1/tasks").json()["total"] == 0


def test_archive_parent_preserves_individual_archives_and_resolution(client):
    space, _ = create_space(client)
    section = create_section(client, space)
    a = create_task(client, space, section_id=section["id"])
    b = create_task(client, space, title="Archive personnelle", section_id=section["id"])
    assert (
        client.patch(
            f"/api/v1/tasks/{b['id']}",
            json={
                "expected_version": b["version"],
                "archived": True,
            },
        ).status_code
        == 200
    )
    path = f"/api/v1/workspaces/{space['id']}/sections/{section['id']}"
    assert client.patch(path, json={"archived": True}).status_code == 200
    assert client.get("/api/v1/tasks").json()["total"] == 0
    assert client.get("/api/v1/tasks?archived=true").json()["total"] == 2
    assert client.patch(path, json={"archived": False}).status_code == 200
    assert [t["id"] for t in client.get("/api/v1/tasks").json()["items"]] == [a["id"]]
    assert [e["kind"] for e in history(client, a)] == ["created"]
    assert [e["kind"] for e in history(client, b)] == ["created", "archived"]


def test_status_reconfiguration_does_not_rewrite_resolution(client):
    space, statuses = create_space(client)
    item = create_task(client, space)
    base = f"/api/v1/workspaces/{space['id']}/statuses"
    assert (
        client.patch(f"{base}/{statuses[0]['id']}", json={"is_completed": True}).status_code == 409
    )
    assert client.delete(f"{base}/{statuses[-1]['id']}").status_code == 409
    assert client.delete(f"{base}/{statuses[0]['id']}").status_code == 409
    assert (
        client.delete(f"{base}/{statuses[0]['id']}?replacement_id={statuses[1]['id']}").status_code
        == 204
    )
    updated = client.get(f"/api/v1/tasks/{item['id']}").json()
    assert updated["status_id"] == statuses[1]["id"] and updated["completed_at"] is None
    assert [e["kind"] for e in history(client, item)] == ["created", "moved"]


def test_ordering_and_stale_edit_conflict(client):
    space, statuses = create_space(client)
    a = create_task(client, space, "Première")
    b = create_task(client, space, "Seconde")
    response = client.post(
        f"/api/v1/tasks/{b['id']}/move",
        json={
            "expected_version": b["version"],
            "workspace_id": space["id"],
            "status_id": statuses[0]["id"],
            "before_id": a["id"],
        },
    )
    assert response.status_code == 200, response.text
    assert [t["id"] for t in client.get("/api/v1/tasks").json()["items"]] == [b["id"], a["id"]]
    assert (
        client.patch(
            f"/api/v1/tasks/{b['id']}",
            json={
                "expected_version": b["version"],
                "title": "Édition périmée",
            },
        ).status_code
        == 409
    )


def test_two_simultaneous_completions_have_one_resolution(client, app):
    space, _ = create_space(client)
    item = create_task(client, space)

    def complete(_):
        request_client = TestClient(app, cookies=client.cookies, headers=dict(client.headers))
        return request_client.post(
            f"/api/v1/tasks/{item['id']}/complete", json={"expected_version": item["version"]}
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(complete, range(2))) == [200, 409]
    assert [e["kind"] for e in history(client, item)] == ["created", "completed"]


def test_filters_pagination_and_persisted_view(client):
    space, statuses = create_space(client)
    section = create_section(client, space, visibility="board")
    label = client.post(f"/api/v1/workspaces/{space['id']}/labels", json={"name": "urgent"}).json()
    create_task(
        client,
        space,
        title="Budget 100%",
        priority=1,
        due_date="2026-11-12",
        label_ids=[label["id"]],
        section_id=section["id"],
    )
    create_task(client, space, title="Autre", due_date="2026-11-13")
    assert client.get("/api/v1/tasks", params={"search": "%"}).json()["total"] == 1
    assert (
        client.get("/api/v1/tasks", params={"due": "overdue", "today": "2026-11-13"}).json()[
            "total"
        ]
        == 1
    )
    page = client.get("/api/v1/tasks", params={"limit": 1, "offset": 1}).json()
    assert page["total"] == 2 and len(page["items"]) == 1
    settings = {
        "layout": "board",
        "density": "compact",
        "show_completed": False,
        "search": "Budget",
        "sort": "priority",
        "priority": 1,
        "label_id": label["id"],
        "status_id": statuses[0]["id"],
        "due": "overdue",
    }
    path = f"/api/v1/workspaces/{space['id']}/view"
    assert client.put(path, json=settings).status_code == 200
    assert client.get(path).json() == settings
    assert client.put("/api/v1/preferences", json={"theme": "dark"}).status_code == 200
    assert client.get("/api/v1/auth/session").json()["theme"] == "dark"


def test_history_is_immutable_in_database(client, engine):
    space, _ = create_space(client)
    item = create_task(client, space)
    with engine.begin() as conn:
        with pytest.raises(DBAPIError):
            conn.execute(text("UPDATE task_events SET kind = 'updated'"))
    assert [e["kind"] for e in history(client, item)] == ["created"]


def test_missing_session_csrf_origin_and_owner_isolation(client, app):
    space, statuses = create_space(client)
    item = create_task(client, space)
    anonymous = TestClient(app)
    assert anonymous.get("/api/v1/tasks").status_code == 401
    assert anonymous.post("/api/v1/workspaces", json={"name": "X"}).status_code == 401
    assert (
        client.post(
            "/api/v1/tasks",
            headers={"X-CSRF-Token": "invalid"},
            json={
                "workspace_id": space["id"],
                "title": "X",
            },
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/tasks",
            headers={"Origin": "https://evil.example"},
            json={
                "workspace_id": space["id"],
                "title": "X",
            },
        ).status_code
        == 403
    )
    response = anonymous.post(
        "/api/v1/auth/session", json={"username": "bob", "password": PASSWORD}
    )
    anonymous.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    assert anonymous.get("/api/v1/tasks").json()["total"] == 0
    for path in (
        f"/workspaces/{space['id']}",
        f"/tasks/{item['id']}",
        f"/tasks/{item['id']}/events",
    ):
        assert anonymous.get("/api/v1" + path).status_code == 404
    assert (
        anonymous.post(
            f"/api/v1/tasks/{item['id']}/complete", json={"expected_version": item["version"]}
        ).status_code
        == 404
    )
    other, _ = create_space(anonymous)
    assert (
        anonymous.post(
            "/api/v1/tasks",
            json={"workspace_id": other["id"], "title": "X", "status_id": statuses[0]["id"]},
        ).status_code
        == 404
    )


def test_login_rate_limit_expiry_logout_and_private_cache(client, app, engine):
    anonymous = TestClient(app)
    for _ in range(5):
        assert (
            anonymous.post(
                "/api/v1/auth/session", json={"username": "unknown", "password": "bad"}
            ).status_code
            == 401
        )
    assert (
        anonymous.post(
            "/api/v1/auth/session", json={"username": "unknown", "password": "bad"}
        ).status_code
        == 429
    )
    assert client.get("/api/v1/tasks").headers["cache-control"] == "no-store"
    assert client.delete("/api/v1/auth/session").status_code == 204
    assert client.get("/api/v1/tasks").status_code == 401
    login = client.post("/api/v1/auth/session", json={"username": "alice", "password": PASSWORD})
    assert (
        "HttpOnly" in login.headers["set-cookie"] and "SameSite=lax" in login.headers["set-cookie"]
    )
    with Session(engine) as db, db.begin():
        for session in db.scalars(select(LoginSession)):
            session.expires_at = utcnow() - timedelta(seconds=1)
    assert client.get("/api/v1/tasks").status_code == 401


@pytest.mark.parametrize(
    "payload",
    [{"name": " "}, {"name": "X", "color": "red"}, {"name": "X", "owner_id": str(uuid4())}],
)
def test_validation_rejects_invalid_or_untrusted_fields(client, payload):
    assert client.post("/api/v1/workspaces", json=payload).status_code == 422


def test_editor_updates_destination_and_metadata_atomically(client):
    space, statuses = create_space(client)
    section = create_section(client, space)
    item = create_task(client, space)
    path = f"/api/v1/tasks/{item['id']}"
    payload = {
        "expected_version": item["version"],
        "title": "Nouvelle version",
        "section_id": section["id"],
        "status_id": statuses[-1]["id"],
        "label_ids": [str(uuid4())],
    }
    assert client.patch(path, json=payload).status_code == 404
    assert client.get(path).json() == item
    assert [e["kind"] for e in history(client, item)] == ["created"]
    payload["label_ids"] = []
    saved = client.patch(path, json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["completed_at"]
    assert saved.json()["section_id"] == section["id"]
    assert saved.json()["version"] == item["version"] + 1
    assert [e["kind"] for e in history(client, item)] == ["created", "completed", "moved"]
    restored = client.patch(
        path,
        json={
            "expected_version": saved.json()["version"],
            "section_id": None,
            "due_date": None,
        },
    )
    assert restored.status_code == 200
    assert restored.json()["section_id"] is None
    assert restored.json()["completed_at"] == saved.json()["completed_at"]


def test_configuration_orders_archives_and_reference_cleanup(client):
    space, statuses = create_space(client)
    other, _ = create_space(client, "Autre")
    section = create_section(client, space, visibility="list")
    base = f"/api/v1/workspaces/{space['id']}"
    assert client.put("/api/v1/workspaces/order", json={"ids": [space["id"]]}).status_code == 409
    assert (
        client.put("/api/v1/workspaces/order", json={"ids": [other["id"], space["id"]]}).status_code
        == 204
    )
    assert client.get("/api/v1/workspaces").json()[0]["id"] == other["id"]
    assert (
        client.put(
            f"{base}/sections/order", json={"ids": [section["id"], section["id"]]}
        ).status_code
        == 409
    )
    label = client.post(f"{base}/labels", json={"name": "unique"}).json()
    assert client.post(f"{base}/labels", json={"name": "unique"}).status_code == 409
    task = create_task(client, space, label_ids=[label["id"]])
    assert (
        client.put(
            f"{base}/view", json={"label_id": label["id"], "status_id": statuses[1]["id"]}
        ).status_code
        == 200
    )
    assert client.delete(f"{base}/labels/{label['id']}").status_code == 204
    assert client.get(f"/api/v1/tasks/{task['id']}").json()["label_ids"] == []
    assert client.get(f"{base}/view").json()["label_id"] is None
    assert client.delete(f"{base}/statuses/{statuses[1]['id']}").status_code == 204
    assert client.get(f"{base}/view").json()["status_id"] is None
    assert client.patch(base, json={"archived": True}).status_code == 200
    assert client.get("/api/v1/tasks").json()["total"] == 0
    assert client.get("/api/v1/tasks?archived=true").json()["total"] == 1
    assert client.post(f"{base}/sections", json={"name": "Refusé"}).status_code == 409
    assert client.patch(base, json={"archived": False}).status_code == 200
    assert client.get("/api/v1/tasks").json()["total"] == 1
    assert [e["kind"] for e in history(client, task)] == ["created"]


def test_readiness_and_secure_session_cookie(client, app):
    assert client.get("/api/v1/health/ready").status_code == 200
    app.state.settings.environment = "production"
    app.state.settings.public_base_url = "https://testserver"
    secure_client = TestClient(app, base_url="https://testserver")
    login = secure_client.post(
        "/api/v1/auth/session",
        json={"username": "alice", "password": PASSWORD},
        headers={"Origin": "https://testserver"},
    )
    assert login.status_code == 200
    cookie = login.headers["set-cookie"].lower()
    assert "httponly" in cookie and "secure" in cookie and "samesite=lax" in cookie
    assert secure_client.get("/api/v1/tasks").status_code == 200
    invalid = secure_client.post(
        "/api/v1/auth/session", json={"username": "alice", "password": PASSWORD, "unknown": "value"}
    )
    assert invalid.status_code == 422
    assert PASSWORD not in invalid.text


def test_reset_password_revokes_existing_sessions(client, engine, monkeypatch):
    import io

    from life_app import cli

    with engine.connect() as connection:
        schema = connection.scalar(text("SELECT current_schema()"))
    url = engine.url.update_query_dict({"options": f"-csearch_path={schema}"})
    settings = Settings(_env_file=None, database_url=url.render_as_string(hide_password=False))
    monkeypatch.setattr(cli, "get_settings", lambda: settings)
    monkeypatch.setattr("sys.argv", ["life", "reset-password", "ALICE", "--password-stdin"])
    monkeypatch.setattr("sys.stdin", io.StringIO("new-synthetic-password\n"))
    cli.main()
    assert client.get("/api/v1/tasks").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/session", json={"username": "alice", "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/session", json={"username": "alice", "password": "new-synthetic-password"}
        ).status_code
        == 200
    )


def child_space(client, parent, name="Sous-espace"):
    response = client.post("/api/v1/workspaces", json={"name": name, "parent_id": parent["id"]})
    assert response.status_code == 201, response.text
    return response.json()


def test_workspace_tree_reparenting_preserves_tasks_and_history(client):
    root, _ = create_space(client)
    child = child_space(client, root)
    leaf = child_space(client, child, "Troisième niveau")
    destination, _ = create_space(client, "Autre racine")
    item = mutate(client, create_task(client, leaf), "complete")
    events = history(client, item)
    assert root["parent_id"] is None
    assert leaf["parent_id"] == child["id"]
    path = f"/api/v1/workspaces/{child['id']}"
    assert client.patch(path, json={"parent_id": destination["id"]}).status_code == 200
    assert client.get(path).json()["parent_id"] == destination["id"]
    assert client.get(f"/api/v1/workspaces/{leaf['id']}").json()["parent_id"] == child["id"]
    assert client.get(f"/api/v1/tasks/{item['id']}").json() == item
    assert history(client, item) == events
    assert client.get("/api/v1/tasks", params={"workspace_id": child["id"]}).json()["total"] == 0
    assert client.patch(path, json={"parent_id": None}).json()["parent_id"] is None
    assert client.patch(path, json={"name": "Renommé"}).json()["parent_id"] is None
    ids = [leaf["id"], child["id"], root["id"], destination["id"]]
    assert client.put("/api/v1/workspaces/order", json={"ids": ids}).status_code == 204
    assert [space["id"] for space in client.get("/api/v1/workspaces").json()] == ids
    assert client.get(f"/api/v1/workspaces/{leaf['id']}").json()["parent_id"] == child["id"]


def test_workspace_parent_validation_and_owner_isolation(client, app):
    root, _ = create_space(client)
    child = child_space(client, root)
    leaf = child_space(client, child)
    path = f"/api/v1/workspaces/{root['id']}"
    for parent_id in [root["id"], child["id"], leaf["id"]]:
        assert (
            client.patch(path, json={"parent_id": parent_id, "name": "Invalid"}).status_code == 409
        )
        assert client.get(path).json() == root
    bob = TestClient(app)
    login = bob.post("/api/v1/auth/session", json={"username": "bob", "password": PASSWORD})
    bob.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    foreign, _ = create_space(bob)
    for parent_id in [str(uuid4()), foreign["id"]]:
        assert client.patch(path, json={"parent_id": parent_id}).status_code == 404
        assert (
            client.post(
                "/api/v1/workspaces", json={"name": "X", "parent_id": parent_id}
            ).status_code
            == 404
        )
    for value in ["invalid", "", 12]:
        assert client.patch(path, json={"parent_id": value}).status_code == 422
    assert len(client.get("/api/v1/workspaces").json()) == 3
    section = create_section(client, root)
    assert (
        client.patch(f"{path}/sections/{section['id']}", json={"parent_id": root["id"]}).status_code
        == 422
    )
    schemas = client.get("/api/openapi.json").json()["components"]["schemas"]
    assert "parent_id" in schemas["WorkspaceOutput"]["properties"]
    assert "parent_id" not in schemas["SectionPatch"]["properties"]


def test_workspace_tree_archive_restore_and_atomic_reparent(client):
    root, _ = create_space(client)
    child = child_space(client, root)
    leaf = child_space(client, child)
    item = mutate(client, create_task(client, leaf), "complete")
    events = history(client, item)
    paths = [f"/api/v1/workspaces/{space['id']}" for space in [root, child, leaf]]
    for path in paths[:2]:
        assert client.patch(path, json={"archived": True}).status_code == 409
    for path in reversed(paths):
        assert client.patch(path, json={"archived": True}).status_code == 200
    assert client.get("/api/v1/workspaces").json() == []
    assert len(client.get("/api/v1/workspaces?archived=true").json()) == 3
    assert client.get("/api/v1/tasks").json()["total"] == 0
    for path in paths[1:]:
        assert client.patch(path, json={"archived": False}).status_code == 409
    assert (
        client.post("/api/v1/workspaces", json={"name": "X", "parent_id": root["id"]}).status_code
        == 409
    )
    other, _ = create_space(client, "Racine active")
    assert (
        client.patch(
            f"/api/v1/workspaces/{other['id']}", json={"parent_id": root["id"]}
        ).status_code
        == 409
    )
    for path in paths:
        assert client.patch(path, json={"archived": False}).status_code == 200
    assert client.get(f"/api/v1/tasks/{item['id']}").json() == item
    assert history(client, item) == events
    for path in reversed(paths):
        assert client.patch(path, json={"archived": True}).status_code == 200
    # Restore and detach in one request, without first restoring the old parent.
    restored = client.patch(paths[1], json={"archived": False, "parent_id": None})
    assert restored.status_code == 200 and restored.json()["parent_id"] is None
    assert client.patch(paths[2], json={"archived": False}).status_code == 200


def test_concurrent_workspace_parent_changes_cannot_create_cycle(client, app):
    a, _ = create_space(client)
    b, _ = create_space(client)

    def reparent(pair):
        item, parent = pair
        with TestClient(app, cookies=client.cookies, headers=dict(client.headers)) as request:
            return request.patch(
                f"/api/v1/workspaces/{item['id']}", json={"parent_id": parent["id"]}
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(reparent, [(a, b), (b, a)])) == [200, 409]


def test_concurrent_archive_and_child_creation_preserve_tree(client, app):
    root, _ = create_space(client)

    def change(archive):
        with TestClient(app, cookies=client.cookies, headers=dict(client.headers)) as request:
            if archive:
                return request.patch(
                    f"/api/v1/workspaces/{root['id']}", json={"archived": True}
                ).status_code
            return request.post(
                "/api/v1/workspaces", json={"name": "Child", "parent_id": root["id"]}
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(change, [True, False]))
    assert results in ([200, 409], [409, 201])


def test_workspace_parent_database_constraints(client, app, engine):
    root, _ = create_space(client)
    with Session(engine) as db:
        bob_id = db.scalar(select(User.id).where(User.username == "bob"))
    for assignment, params in [
        ("parent_id = id", {}),
        ("parent_id = :missing", {"missing": uuid4()}),
    ]:
        with engine.begin() as conn, pytest.raises(IntegrityError):
            conn.execute(
                text(f"UPDATE workspaces SET {assignment} WHERE id = :id"),
                {"id": UUID(root["id"]), **params},
            )
    child = child_space(client, root)
    with engine.begin() as conn, pytest.raises(IntegrityError):
        conn.execute(
            text("UPDATE workspaces SET owner_id = :owner WHERE id = :id"),
            {"owner": bob_id, "id": UUID(child["id"])},
        )


def test_workspace_parent_migration_preserves_existing_data(client, engine):
    root, _ = create_space(client)
    child = child_space(client, root)
    item = mutate(client, create_task(client, child), "complete")
    events = history(client, item)
    with engine.begin() as conn:
        config = migration_config()
        config.attributes["connection"] = conn
        command.downgrade(config, "0001")
        assert conn.scalar(text("SELECT count(*) FROM workspaces")) == 2
        assert conn.scalar(text("SELECT count(*) FROM task_events")) == len(events)
        command.upgrade(config, "head")
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []
    assert all(space["parent_id"] is None for space in client.get("/api/v1/workspaces").json())
    assert client.get(f"/api/v1/tasks/{item['id']}").json() == item
    assert history(client, item) == events
    assert (
        client.patch(
            f"/api/v1/workspaces/{child['id']}", json={"parent_id": root["id"]}
        ).status_code
        == 200
    )


def test_agenda_periods_and_global_visibility(client, app):
    first, _ = create_space(client, "Maison")
    second = child_space(client, first, "Travail")
    hidden = create_section(client, second, visibility="board")
    dates = ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-06", "2027-01-07"]
    items = [
        create_task(
            client,
            first if i % 2 == 0 else second,
            title=str(i),
            due_date=value,
            **({"section_id": hidden["id"]} if i % 2 else {}),
        )
        for i, value in enumerate(dates)
    ]
    create_task(client, first, title="Sans échéance")
    completed = mutate(client, create_task(client, first, due_date=dates[1]), "complete")
    mutate(client, create_task(client, first, due_date=dates[0]), "complete")
    archived = create_task(client, first, due_date=dates[1])
    assert (
        client.patch(
            f"/api/v1/tasks/{archived['id']}",
            json={
                "expected_version": archived["version"],
                "archived": True,
            },
        ).status_code
        == 200
    )
    archived_section = create_section(client, first, "Archivée")
    create_task(client, first, due_date=dates[1], section_id=archived_section["id"])
    assert (
        client.patch(
            f"/api/v1/workspaces/{first['id']}/sections/{archived_section['id']}",
            json={"archived": True},
        ).status_code
        == 200
    )
    archived_space, _ = create_space(client, "Archivé")
    create_task(client, archived_space, due_date=dates[1])
    assert (
        client.patch(
            f"/api/v1/workspaces/{archived_space['id']}", json={"archived": True}
        ).status_code
        == 200
    )
    with TestClient(app) as bob:
        session = bob.post("/api/v1/auth/session", json={"username": "bob", "password": PASSWORD})
        bob.headers["X-CSRF-Token"] = session.json()["csrf_token"]
        other, _ = create_space(bob)
        create_task(bob, other, due_date=dates[1])

    def read(**params):
        response = client.get("/api/v1/agenda/tasks", params={"today": dates[1], **params})
        assert response.status_code == 200, response.text
        return response.json()

    assert [task["id"] for task in read()["items"]] == [item["id"] for item in items[:2]]
    for period, count, expected_ids, start, end in [
        ("today", 14, [1], dates[1], dates[1]),
        ("tomorrow", 14, [2], dates[2], dates[2]),
        ("week", 14, [1, 2, 3, 4], dates[1], dates[4]),
        ("custom", 2, [1, 2], dates[1], dates[2]),
        ("custom", 1, [1], dates[1], dates[1]),
    ]:
        assert (
            client.put(
                "/api/v1/agenda/view",
                json={
                    "period": period,
                    "custom_days": count,
                    "include_overdue": False,
                },
            ).status_code
            == 200
        )
        result = read()
        assert [task["id"] for task in result["items"]] == [items[i]["id"] for i in expected_ids]
        assert (result["today"], result["start_date"], result["end_date"]) == (dates[1], start, end)
        assert result["total"] == len(expected_ids)

    client.put("/api/v1/agenda/view", json={"period": "week", "show_completed": True})
    full = read()
    assert full["total"] == 6
    assert completed["id"] in [item["id"] for item in full["items"]]
    paged = [read(offset=i, limit=1)["items"][0]["id"] for i in range(6)]
    assert paged == [item["id"] for item in full["items"]]
    # Merely viewing or changing preferences never changes task dates/history.
    assert client.get(f"/api/v1/tasks/{items[1]['id']}").json() == items[1]
    assert len(history(client, items[1])) == 1
    reopened = mutate(client, completed, "reopen")
    assert reopened["due_date"] == dates[1]
    assert [event["kind"] for event in history(client, reopened)] == [
        "created",
        "completed",
        "reopened",
    ]


@pytest.mark.parametrize(
    "today,end",
    [
        ("2026-03-27", "2026-04-02"),  # daylight-saving change
        ("2026-10-23", "2026-10-29"),
        ("2028-02-27", "2028-03-04"),  # leap year
    ],
)
def test_agenda_calendar_boundaries(client, today, end):
    client.put("/api/v1/agenda/view", json={"period": "week"})
    result = client.get("/api/v1/agenda/tasks", params={"today": today}).json()
    assert result["start_date"] == today
    assert result["end_date"] == end


def test_agenda_preferences_validation_and_access(client, app):
    defaults = {
        "period": "today",
        "custom_days": 14,
        "include_overdue": True,
        "show_completed": False,
    }
    assert client.get("/api/v1/agenda/view").json() == defaults
    settings = {
        "period": "custom",
        "custom_days": 90,
        "include_overdue": False,
        "show_completed": True,
    }
    assert client.put("/api/v1/agenda/view", json=settings).json() == settings
    assert client.get("/api/v1/agenda/view").json() == settings
    with TestClient(app) as other:
        for path in ("/agenda/view", "/agenda/tasks"):
            assert other.get("/api/v1" + path).status_code == 401
        assert other.put("/api/v1/agenda/view", json={}).status_code == 401
        login = other.post("/api/v1/auth/session", json={"username": "bob", "password": PASSWORD})
        assert other.get("/api/v1/agenda/view").json() == defaults
        assert other.put("/api/v1/agenda/view", json=settings).status_code == 403
        other.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        assert (
            other.put(
                "/api/v1/agenda/view", json={}, headers={"Origin": "https://invalid.example"}
            ).status_code
            == 403
        )
        # Preference changes are scoped to the logged-in account.
        assert other.put("/api/v1/agenda/view", json={"period": "tomorrow"}).status_code == 200
    assert client.get("/api/v1/agenda/view").json() == settings
    for invalid in [
        {"period": "year"},
        {"custom_days": 0},
        {"custom_days": 91},
        {"custom_days": 1.5},
        {"period": None},
        {"owner_id": str(uuid4())},
    ]:
        assert client.put("/api/v1/agenda/view", json=invalid).status_code == 422
    for invalid in [
        {"today": "not-a-date"},
        {"limit": 201},
        {"offset": -1},
        {"today": "9999-12-31"},
    ]:
        assert client.get("/api/v1/agenda/tasks", params=invalid).status_code == 422
    assert client.put("/api/v1/agenda/view", json={}).json() == defaults
    schema = client.get("/api/openapi.json").json()
    assert "AgendaSettings" in schema["components"]["schemas"]
    assert "get" in schema["paths"]["/api/v1/agenda/tasks"]


def test_agenda_migration_preserves_existing_data(client, engine):
    root, _ = create_space(client)
    space = child_space(client, root)
    item = create_task(client, space, due_date="2026-12-31")
    completed = mutate(client, item, "complete")
    events = history(client, completed)
    client.put("/api/v1/agenda/view", json={"period": "week"})
    with engine.begin() as conn:
        config = migration_config()
        config.attributes["connection"] = conn
        command.downgrade(config, "0002")
        command.upgrade(config, "head")
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []
    assert client.get(f"/api/v1/tasks/{item['id']}").json() == completed
    assert history(client, item) == events
    assert client.get(f"/api/v1/workspaces/{space['id']}").json()["parent_id"] == root["id"]
    assert client.get("/api/v1/agenda/view").json()["period"] == "today"
    # A preference row must reference a real account, and each account has one row.
    with engine.begin() as conn, pytest.raises(IntegrityError):
        conn.execute(
            text("INSERT INTO agenda_preferences VALUES (:id, '{}'::jsonb)"), {"id": uuid4()}
        )

    client.put("/api/v1/agenda/view", json={"period": "week"})
    with engine.begin() as conn, pytest.raises(IntegrityError):
        conn.execute(
            text("INSERT INTO agenda_preferences SELECT user_id, settings FROM agenda_preferences")
        )
