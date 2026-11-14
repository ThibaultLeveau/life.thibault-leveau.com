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


def test_schema_matches_models_and_migration_roundtrip(engine):
    with engine.begin() as conn:
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []
        config = migration_config()
        config.attributes["connection"] = conn
        command.downgrade(config, "base")
        command.upgrade(config, "head")
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []


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
