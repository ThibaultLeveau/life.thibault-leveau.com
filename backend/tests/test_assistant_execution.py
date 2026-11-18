"""Dispatcher authorization, concurrent receipts and preview invalidation."""

from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from test_assistant import admitted
from test_assistant import client as client

from life_app.apps.registry import APPLICATIONS
from life_app.platform.assistant import execution
from life_app.platform.assistant import models as m


def test_every_business_capability_checks_activation_before_parsing_or_execution(app, client):
    for domain in APPLICATIONS:
        assert (
            client.put(f"/api/v1/applications/{domain.id}", json={"enabled": False}).status_code
            == 200
        )
    run_id, _ = admitted(app, client)
    count = 0
    for domain in APPLICATIONS:
        assert domain.actions is not None
        for action in domain.actions.actions:
            with pytest.raises(HTTPException) as denied:
                execution.execute(app, run_id, 1, domain.id, action.name, {})
            assert denied.value.status_code == 403, (domain.id, action.name)
            assert denied.value.headers["X-Life-Application-Disabled"] == domain.id
            count += 1
    assert count >= 115
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.Operation)) == 0


def test_simultaneous_replayed_actions_commit_one_mutation_and_receipt(app, client):
    run_id, _ = admitted(app, client)
    args = {"payload": {"name": "Une seule fois"}}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(execution.execute, app, run_id, 1, "tasks", "create_workspace", args)
            for _ in range(2)
        ]
        results = [future.result(timeout=10) for future in futures]
    assert results[0]["operation_id"] == results[1]["operation_id"]
    assert results[0]["result"] == results[1]["result"]
    assert len(client.get("/api/v1/workspaces").json()) == 1
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.Operation)) == 1
    with pytest.raises(HTTPException) as collision:
        execution.execute(
            app, run_id, 1, "tasks", "create_workspace", {"payload": {"name": "Autre"}}
        )
    assert collision.value.status_code == 409


def test_failed_receipt_rolls_back_the_business_write(app, client, monkeypatch):
    run_id, _ = admitted(app, client)

    def broken_receipt(*args):
        raise RuntimeError("synthetic receipt failure")

    monkeypatch.setattr(execution, "attach", broken_receipt)
    with pytest.raises(RuntimeError, match="receipt failure"):
        execution.execute(
            app, run_id, 1, "tasks", "create_workspace", {"payload": {"name": "Rollback"}}
        )
    assert client.get("/api/v1/workspaces").json() == []
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.Operation)) == 0


def test_concurrent_confirmations_are_idempotent_and_owner_scoped(app, client):
    run_id, _ = admitted(app, client)
    preview = execution.execute(
        app, run_id, 1, "tasks", "create_workspace", {"payload": {"name": "Confirmé"}}, propose=True
    )
    endpoint = f"/api/v1/assistant/operations/{preview['operation_id']}/confirm"
    with TestClient(app) as bob:
        session = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        bob.headers["X-CSRF-Token"] = session.json()["csrf_token"]
        assert bob.post(endpoint).status_code == 404

    def confirm():
        with TestClient(app) as other:
            other.cookies.update(dict(client.cookies))
            other.headers["X-CSRF-Token"] = client.headers["X-CSRF-Token"]
            return other.post(endpoint)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(confirm) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert [response.status_code for response in results] == [200, 200]
    assert results[0].json() == results[1].json()
    assert len(client.get("/api/v1/workspaces").json()) == 1


def test_confirmation_rechecks_activation_and_unversioned_preview_state(app, client):
    run_id, _ = admitted(app, client)
    created = client.post("/api/v1/workspaces", json={"name": "À archiver"}).json()
    preview = execution.execute(
        app,
        run_id,
        1,
        "tasks",
        "archive_workspace",
        {"workspace_id": created["id"], "payload": {"archived": True}},
    )
    endpoint = f"/api/v1/assistant/operations/{preview['operation_id']}/confirm"
    assert client.get(f"/api/v1/workspaces/{created['id']}").json()["archived_at"] is None
    client.put("/api/v1/applications/tasks", json={"enabled": False})
    assert client.post(endpoint).status_code == 403
    client.put("/api/v1/applications/tasks", json={"enabled": True})
    client.post(
        "/api/v1/tasks", json={"workspace_id": created["id"], "title": "Créée après aperçu"}
    )
    changed = client.post(endpoint)
    assert changed.status_code == 409
    assert client.get(f"/api/v1/workspaces/{created['id']}").json()["archived_at"] is None


def test_confirmation_rechecks_expected_version(app, client):
    run_id, _ = admitted(app, client)
    space = client.post("/api/v1/workspaces", json={"name": "Projet"}).json()
    task = client.post(
        "/api/v1/tasks", json={"workspace_id": space["id"], "title": "Version initiale"}
    ).json()
    preview = execution.execute(
        app,
        run_id,
        1,
        "tasks",
        "edit_task",
        {
            "task_id": task["id"],
            "payload": {"expected_version": task["version"], "title": "Proposition"},
        },
        propose=True,
    )
    modified = client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"expected_version": task["version"], "title": "Modification concurrente"},
    ).json()
    assert (
        client.post(f"/api/v1/assistant/operations/{preview['operation_id']}/confirm").status_code
        == 409
    )
    assert client.get(f"/api/v1/tasks/{task['id']}").json() == modified


@pytest.mark.parametrize(
    "name",
    [
        "edit_workspace",
        "edit_section",
        "edit_status",
        "edit_label",
        "save_view",
        "save_agenda_settings",
    ],
)
def test_optional_tasks_previews_preserve_intervening_unversioned_edits(app, client, name):
    run_id, _ = admitted(app, client)
    space = client.post("/api/v1/workspaces", json={"name": "Projet"}).json()
    base = f"/api/v1/workspaces/{space['id']}"
    arguments = {"workspace_id": space["id"], "payload": {"name": "Proposition"}}
    endpoint, read_endpoint = base, base
    method, changed = "PATCH", {"name": "Modification manuelle"}
    if name in {"edit_section", "edit_status", "edit_label"}:
        kind = name.removeprefix("edit_")
        collection = (
            base + "/" + {"section": "sections", "status": "statuses", "label": "labels"}[kind]
        )
        item = client.post(collection, json={"name": "Initial"}).json()
        arguments[kind + "_id"] = item["id"]
        endpoint, read_endpoint = collection + "/" + item["id"], collection
        if kind == "label":
            method = "PUT"
    elif name == "save_view":
        endpoint = read_endpoint = base + "/view"
        arguments["payload"] = {"layout": "board"}
        method, changed = "PUT", {"density": "compact"}
    elif name == "save_agenda_settings":
        endpoint = read_endpoint = "/api/v1/agenda/view"
        arguments = {"payload": {"period": "week"}}
        method, changed = "PUT", {"period": "tomorrow"}
    before = client.get(read_endpoint).json()
    preview = execution.execute(app, run_id, 1, "tasks", name, arguments, propose=True)
    assert preview["status"] == "preview"
    assert client.get(read_endpoint).json() == before
    mutation = client.request(method, endpoint, json=changed)
    assert mutation.status_code == 200, mutation.text
    current = client.get(read_endpoint).json()
    result = client.post(f"/api/v1/assistant/operations/{preview['operation_id']}/confirm")
    assert result.status_code == 409, result.text
    assert result.json()["code"] == "assistant.preview_changed"
    assert client.get(read_endpoint).json() == current


@pytest.mark.parametrize(
    "name",
    ["reorder_workspaces", "reorder_sections", "reorder_statuses", "delete_status", "delete_label"],
)
def test_empty_mutation_results_keep_named_preview_targets_through_confirmation(app, client, name):
    run_id, _ = admitted(app, client)
    space = client.post("/api/v1/workspaces", json={"name": "Projet lisible"}).json()
    base = f"/api/v1/workspaces/{space['id']}"
    arguments = {"workspace_id": space["id"]}
    if name == "reorder_workspaces":
        endpoint = "/api/v1/workspaces"
        arguments = {"payload": {"ids": [space["id"]]}}
        expected = ["Projet lisible"]
    elif name in {"reorder_sections", "delete_label"}:
        plural = "sections" if name == "reorder_sections" else "labels"
        endpoint = base + "/" + plural
        item = client.post(endpoint, json={"name": "Cible nommée"}).json()
        expected = ["Projet lisible › Cible nommée"]
        arguments.update(
            {"payload": {"ids": [item["id"]]}}
            if name == "reorder_sections"
            else {"label_id": item["id"]}
        )
    else:
        endpoint = base + "/statuses"
        statuses = client.get(endpoint).json()
        if name == "reorder_statuses":
            arguments["payload"] = {"ids": [item["id"] for item in reversed(statuses)]}
            expected = [f"Projet lisible › {item['name']}" for item in reversed(statuses)]
        else:
            item = client.post(endpoint, json={"name": "Statut à supprimer"}).json()
            arguments.update({"status_id": item["id"], "replacement_id": statuses[0]["id"]})
            expected = [
                "Projet lisible › Statut à supprimer",
                f"Réaffecter vers : {statuses[0]['name']}",
            ]
    before = client.get(endpoint).json()
    preview = execution.execute(app, run_id, 1, "tasks", name, arguments)
    assert preview["result"] is None
    assert preview["snippet"]["data"]["targets"] == expected
    assert preview["snippet"]["data"]["labels"]["en"]
    assert client.get(endpoint).json() == before
    path = f"/api/v1/assistant/operations/{preview['operation_id']}/confirm"
    confirmed = client.post(path)
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["snippet"]["data"]["targets"] == expected
    assert client.post(path).json() == confirmed.json()


def test_bulk_archive_preview_names_tasks_and_preserves_their_current_state(app, client):
    run_id, _ = admitted(app, client)
    space = client.post("/api/v1/workspaces", json={"name": "Projet"}).json()
    task = client.post(
        "/api/v1/tasks", json={"workspace_id": space["id"], "title": "Préparer le dossier"}
    ).json()
    preview = execution.execute(
        app,
        run_id,
        1,
        "tasks",
        "bulk_tasks",
        {
            "payload": {
                "action": "archive",
                "tasks": [{"id": task["id"], "expected_version": task["version"]}],
            }
        },
    )
    assert preview["snippet"]["data"]["targets"] == ["Préparer le dossier"]
    assert preview["result"][0]["archived_at"]
    assert client.get(f"/api/v1/tasks/{task['id']}").json() == task


def test_move_previews_name_current_object_and_destination_without_moving(app, client):
    run_id, _ = admitted(app, client)
    origin = client.post("/api/v1/workspaces", json={"name": "Source"}).json()
    destination = client.post("/api/v1/workspaces", json={"name": "Destination nommée"}).json()
    section = client.post(
        f"/api/v1/workspaces/{destination['id']}/sections", json={"name": "Prochaine étape"}
    ).json()
    status = client.get(f"/api/v1/workspaces/{destination['id']}/statuses").json()[0]
    task = client.post(
        "/api/v1/tasks", json={"workspace_id": origin["id"], "title": "Mon dossier"}
    ).json()
    moved = execution.execute(
        app,
        run_id,
        1,
        "tasks",
        "move_task",
        {
            "task_id": task["id"],
            "payload": {
                "expected_version": task["version"],
                "workspace_id": destination["id"],
                "section_id": section["id"],
                "status_id": status["id"],
            },
        },
        propose=True,
    )
    assert moved["snippet"]["data"]["targets"] == [
        "Mon dossier",
        "Destination : Destination nommée › Prochaine étape",
    ]
    workspace = execution.execute(
        app,
        run_id,
        2,
        "tasks",
        "edit_workspace",
        {"workspace_id": origin["id"], "payload": {"parent_id": destination["id"]}},
        propose=True,
    )
    assert workspace["snippet"]["data"]["targets"] == ["Source", "Destination : Destination nommée"]
    assert client.get(f"/api/v1/tasks/{task['id']}").json() == task
    assert client.get(f"/api/v1/workspaces/{origin['id']}").json() == origin
