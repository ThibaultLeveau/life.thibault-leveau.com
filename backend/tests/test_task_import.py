"""Atomic task creation through HTTP and the assistant's existing receipts."""

from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from test_assistant import admitted
from test_assistant import client as client
from test_tasks import create_section, create_space, history

from life_app.apps.life_ai import execution
from life_app.apps.tasks import models as tasks


def batch(space, count=10):
    return {"tasks": [{"workspace_id": space["id"], "title": f"Import {i}"} for i in range(count)]}


def test_import_preserves_fields_order_history_and_activation(client):
    space, statuses = create_space(client)
    section = create_section(client, space)
    label = client.post(f"/api/v1/workspaces/{space['id']}/labels", json={"name": "Lot"}).json()
    payload = batch(space)
    payload["tasks"][0].update(
        section_id=section["id"],
        description="Description complète",
        priority=2,
        label_ids=[label["id"]],
        due_date="2090-01-01",
        recurrence={"rrule": "FREQ=DAILY", "start_date": "2090-01-01"},
    )
    payload["tasks"][1]["status_id"] = next(s["id"] for s in statuses if s["is_completed"])
    result = client.post("/api/v1/tasks/import", json=payload)
    assert result.status_code == 201, result.text
    items = result.json()
    assert len(items) == 10
    assert [item["title"] for item in items] == [item["title"] for item in payload["tasks"]]
    assert [item["position"] for item in items] == sorted(item["position"] for item in items)
    assert len({item["position"] for item in items}) == 10
    for key in ("section_id", "description", "priority", "due_date", "label_ids"):
        assert items[0][key] == payload["tasks"][0][key]
    assert items[0]["recurrence"]["rrule"] == "FREQ=DAILY"
    assert items[0]["recurrence_completed"] == 0
    assert items[1]["completed_at"] is not None
    histories = [history(client, item) for item in items]
    assert all(events[0]["kind"] == "created" for events in histories)
    assert [event["kind"] for event in histories[1]] == ["created", "completed"]
    assert client.put("/api/v1/applications/tasks", json={"enabled": False}).status_code == 200
    assert client.post("/api/v1/tasks/import", json=payload).status_code == 403
    assert client.put("/api/v1/applications/tasks", json={"enabled": True}).status_code == 200
    for item, events in zip(items, histories, strict=True):
        assert client.get(f"/api/v1/tasks/{item['id']}").json() == item
        assert history(client, item) == events


@pytest.mark.parametrize(
    "invalid,code",
    [
        ({"title": " "}, 422),
        ({"priority": 5}, 422),
        ({"owner_id": str(uuid4())}, 422),
        ({"workspace_id": str(uuid4())}, 404),
        ({"section_id": str(uuid4())}, 404),
        ({"label_ids": [str(uuid4())]}, 404),
    ],
)
def test_import_invalid_late_item_rolls_back_all_tasks_and_events(app, client, invalid, code):
    space, _ = create_space(client)
    payload = batch(space)
    payload["tasks"][-1].update(invalid)
    response = client.post("/api/v1/tasks/import", json=payload)
    assert response.status_code == code, response.text
    assert client.get("/api/v1/tasks").json()["total"] == 0
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(tasks.TaskEvent)) == 0


def test_import_limits_duplicates_owner_csrf_and_archived_destinations(app, client):
    space, _ = create_space(client)
    for count in (0, 101):
        assert client.post("/api/v1/tasks/import", json=batch(space, count)).status_code == 422
    with TestClient(app) as guest:
        assert guest.post("/api/v1/tasks/import", json=batch(space)).status_code == 401
        guest.cookies.update(dict(client.cookies))
        assert guest.post("/api/v1/tasks/import", json=batch(space)).status_code == 403
    assert (
        client.post(
            "/api/v1/tasks/import", json=batch(space), headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    with TestClient(app) as bob:
        login = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        bob.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        assert bob.post("/api/v1/tasks/import", json=batch(space)).status_code == 404
    payload = batch(space, 100)
    payload["tasks"][1] = payload["tasks"][0].copy()
    response = client.post("/api/v1/tasks/import", json=payload)
    assert response.status_code == 201, response.text
    assert len(response.json()) == 100
    assert response.json()[0]["id"] != response.json()[1]["id"]
    client.patch(f"/api/v1/workspaces/{space['id']}", json={"archived": True})
    assert client.post("/api/v1/tasks/import", json=batch(space)).status_code == 409


def test_assistant_import_preview_confirmation_replay_and_destination_conflict(app, client):
    space, _ = create_space(client)
    run_id, _ = admitted(app, client, "Créer dix tâches dans mon espace")
    preview = execution.execute(app, run_id, 1, "tasks", "import_tasks", {"payload": batch(space)})
    assert preview["status"] == "preview"
    assert len(preview["result"]) == 10
    assert len(preview["snippet"]["data"]["targets"]) == 10
    assert client.get("/api/v1/tasks").json()["total"] == 0
    endpoint = f"/api/v1/assistant/operations/{preview['operation_id']}/confirm"

    def confirm():
        with TestClient(app) as other:
            other.cookies.update(dict(client.cookies))
            other.headers["X-CSRF-Token"] = client.headers["X-CSRF-Token"]
            return other.post(endpoint)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(confirm) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert [result.status_code for result in results] == [200, 200]
    assert results[0].json() == results[1].json()
    assert client.get("/api/v1/tasks").json()["total"] == 10
    assert {UUID(item["id"]) for item in results[0].json()["result"]}.isdisjoint(
        UUID(item["id"]) for item in preview["result"]
    )
    next_preview = execution.execute(
        app, run_id, 2, "tasks", "import_tasks", {"payload": batch(space)}
    )
    client.patch(f"/api/v1/workspaces/{space['id']}", json={"name": "Renommé"})
    assert (
        client.post(
            f"/api/v1/assistant/operations/{next_preview['operation_id']}/confirm"
        ).status_code
        == 409
    )
    assert client.get("/api/v1/tasks").json()["total"] == 10


def test_oversized_import_rejected_before_any_creation(client):
    space, _ = create_space(client)
    payload = batch(space, 20)
    for item in payload["tasks"]:
        item["description"] = "x" * 20000
    result = client.post("/api/v1/tasks/import", json=payload)
    assert result.status_code == 422
    assert "200 000" in result.text
    assert client.get("/api/v1/tasks").json()["total"] == 0
