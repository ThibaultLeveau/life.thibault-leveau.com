"""Capability parity and atomicity at the Tasks/Sport domain boundary."""

import pytest
from fastapi import HTTPException
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select

from life_app.apps.registry import APPLICATIONS
from life_app.platform.assistant.definition import ActionContext
from life_app.platform.auth.models import User


def definition(application_id, name):
    application = next(item for item in APPLICATIONS if item.id == application_id)
    return next(item for item in application.actions.actions if item.name == name)


def invoke(app, application_id, name, data=None, *, username="alice", commit=True):
    action = definition(application_id, name)
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == username).with_for_update())
        context = ActionContext(db, user, APPLICATIONS)
        result = action.handler(context, action.input_model.model_validate(data or {}))
        serialized = TypeAdapter(action.output_model).dump_python(result, mode="json")
        if commit:
            db.commit()
        else:
            db.rollback()
        return serialized


@pytest.mark.parametrize("application_id,route_count", [("tasks", 36), ("sport", 31)])
def test_capabilities_cover_every_http_operation_with_closed_inputs(application_id, route_count):
    app = next(item for item in APPLICATIONS if item.id == application_id)
    routes = {(method, route.path) for route in app.router.routes for method in route.methods}
    assert len(routes) == route_count
    actions = app.actions.actions
    assert {(action.method, action.path) for action in actions} == routes
    assert len({action.name for action in actions}) == len(actions)
    for action in actions:
        assert action.handler.__module__ == f"life_app.apps.{application_id}.assistant"
        assert action.input_model.model_json_schema()["additionalProperties"] is False
        assert action.description
        assert action.labels and all(0 < len(label) < 80 for label in action.labels)
        if (
            action.method == "DELETE"
            or "archive" in action.name
            or action.name
            in {
                "bulk_tasks",
                "finish_session",
                "repair_scores",
            }
        ):
            assert action.confirmation


@pytest.mark.parametrize("name", ["edit_task", "edit_workspace", "edit_section"])
def test_simple_edits_cannot_bypass_archive_confirmation(name):
    action = definition("tasks", name)
    payload = {"expected_version": 1} if name == "edit_task" else {}
    payload["archived"] = True
    with pytest.raises(ValidationError):
        action.input_model.model_fields["payload"].annotation.model_validate(payload)
    archive = definition("tasks", name.replace("edit", "archive"))
    assert not action.confirmation
    assert archive.confirmation


def test_tasks_structure_preferences_and_http_parity(app, authenticated_client):
    space = invoke(app, "tasks", "create_workspace", {"payload": {"name": "Projet IA"}})
    section = invoke(
        app,
        "tasks",
        "create_section",
        {
            "workspace_id": space["id"],
            "payload": {"name": "Cette semaine"},
        },
    )
    label = invoke(
        app,
        "tasks",
        "create_label",
        {
            "workspace_id": space["id"],
            "payload": {"name": "Focus"},
        },
    )
    status = invoke(
        app,
        "tasks",
        "create_status",
        {
            "workspace_id": space["id"],
            "payload": {"name": "À relire"},
        },
    )
    view = invoke(
        app,
        "tasks",
        "save_view",
        {
            "workspace_id": space["id"],
            "payload": {"status_id": status["id"], "label_id": label["id"], "layout": "board"},
        },
    )
    assert authenticated_client.get(f"/api/v1/workspaces/{space['id']}/view").json() == view
    for name, path in [
        ("list_sections", "sections"),
        ("list_labels", "labels"),
        ("list_statuses", "statuses"),
    ]:
        assert (
            invoke(app, "tasks", name, {"workspace_id": space["id"]})
            == authenticated_client.get(f"/api/v1/workspaces/{space['id']}/{path}").json()
        )
    assert (
        invoke(
            app,
            "tasks",
            "reorder_sections",
            {
                "workspace_id": space["id"],
                "payload": {"ids": [section["id"]]},
            },
        )
        is None
    )
    invoke(app, "tasks", "delete_label", {"workspace_id": space["id"], "label_id": label["id"]})
    invoke(app, "tasks", "delete_status", {"workspace_id": space["id"], "status_id": status["id"]})
    updated = authenticated_client.get(f"/api/v1/workspaces/{space['id']}/view").json()
    assert updated["label_id"] is None and updated["status_id"] is None
    assert updated["layout"] == "board"


def test_task_lifecycle_recurrence_history_and_conflicts(app, authenticated_client):
    space = invoke(app, "tasks", "create_workspace", {"payload": {"name": "Routines"}})
    task = invoke(
        app,
        "tasks",
        "create_task",
        {
            "payload": {
                "workspace_id": space["id"],
                "title": "Lire",
                "due_date": "2090-01-01",
                "recurrence": {"rrule": "FREQ=DAILY", "start_date": "2090-01-01"},
            }
        },
    )
    first = task
    task = invoke(
        app,
        "tasks",
        "complete_task",
        {"task_id": task["id"], "payload": {"expected_version": task["version"]}},
    )
    assert task["due_date"] == "2090-01-02"
    with pytest.raises(HTTPException) as conflict:
        invoke(
            app,
            "tasks",
            "edit_task",
            {
                "task_id": task["id"],
                "payload": {"expected_version": first["version"], "title": "Périmé"},
            },
        )
    assert conflict.value.status_code == 409
    task = invoke(
        app,
        "tasks",
        "undo_completion",
        {"task_id": task["id"], "payload": {"expected_version": task["version"]}},
    )
    assert task["due_date"] == first["due_date"]
    assert authenticated_client.get(f"/api/v1/tasks/{task['id']}").json() == task
    events = invoke(app, "tasks", "task_history", {"task_id": task["id"]})
    assert events == authenticated_client.get(f"/api/v1/tasks/{task['id']}/events").json()
    assert {event["kind"] for event in events["items"]} >= {"completed", "completion_undone"}
    for archived in (True, False):
        task = invoke(
            app,
            "tasks",
            "archive_task",
            {
                "task_id": task["id"],
                "payload": {"expected_version": task["version"], "archived": archived},
            },
        )
        assert bool(task["archived_at"]) is archived
        assert task["due_date"] == first["due_date"]


def test_capability_changes_remain_in_callers_transaction(app, authenticated_client):
    space = invoke(
        app, "tasks", "create_workspace", {"payload": {"name": "Sans commit"}}, commit=False
    )
    assert authenticated_client.get(f"/api/v1/workspaces/{space['id']}").status_code == 404
    exercise = invoke(
        app,
        "sport",
        "create_exercise",
        {"payload": {"name": "Sans commit", "kind": "reps"}},
        commit=False,
    )
    with pytest.raises(HTTPException) as missing:
        invoke(app, "sport", "get_exercise", {"exercise_id": exercise["id"]})
    assert missing.value.status_code == 404


def test_task_bulk_rolls_back_all_changes_on_conflict(app, authenticated_client):
    space = invoke(app, "tasks", "create_workspace", {"payload": {"name": "Lot"}})
    tasks = [
        invoke(
            app,
            "tasks",
            "create_task",
            {"payload": {"workspace_id": space["id"], "title": str(index)}},
        )
        for index in range(2)
    ]
    with pytest.raises(HTTPException) as conflict:
        invoke(
            app,
            "tasks",
            "bulk_tasks",
            {
                "payload": {
                    "action": "complete",
                    "tasks": [
                        {"id": tasks[0]["id"], "expected_version": tasks[0]["version"]},
                        {"id": tasks[1]["id"], "expected_version": tasks[1]["version"] + 1},
                    ],
                }
            },
        )
    assert conflict.value.status_code == 409
    for task in tasks:
        assert authenticated_client.get(f"/api/v1/tasks/{task['id']}").json() == task


def test_capability_ownership_covers_parent_and_child_references(app, authenticated_client):
    space = invoke(app, "tasks", "create_workspace", {"payload": {"name": "Privé"}})
    exercise = invoke(
        app, "sport", "create_exercise", {"payload": {"name": "Privé", "kind": "reps"}}
    )
    for application, name, payload in [
        ("tasks", "get_workspace", {"workspace_id": space["id"]}),
        ("tasks", "list_sections", {"workspace_id": space["id"]}),
        ("tasks", "create_section", {"workspace_id": space["id"], "payload": {"name": "Vol"}}),
        ("tasks", "create_task", {"payload": {"workspace_id": space["id"], "title": "Vol"}}),
        ("sport", "get_exercise", {"exercise_id": exercise["id"]}),
        (
            "sport",
            "create_workout",
            {
                "payload": {
                    "name": "Vol",
                    "entries": [{"exercise_id": exercise["id"], "sets": 1, "target": {}}],
                }
            },
        ),
    ]:
        with pytest.raises(HTTPException) as missing:
            invoke(app, application, name, payload, username="bob")
        assert missing.value.status_code == 404


def test_sport_training_workflow_preserves_snapshots_versions_and_http_parity(
    app, authenticated_client
):
    assert (
        authenticated_client.put("/api/v1/applications/sport", json={"enabled": True}).status_code
        == 200
    )
    exercise = invoke(
        app, "sport", "create_exercise", {"payload": {"name": "Pompes", "kind": "reps"}}
    )
    workout = invoke(
        app,
        "sport",
        "create_workout",
        {
            "payload": {
                "name": "Force",
                "entries": [{"exercise_id": exercise["id"], "sets": 1, "target": {"reps": 10}}],
            }
        },
    )
    assert authenticated_client.get(f"/api/v1/sport/workouts/{workout['id']}").json() == workout
    session = invoke(
        app,
        "sport",
        "start_session",
        {"payload": {"workout_id": workout["id"], "expected_version": workout["version"]}},
    )
    invoke(
        app,
        "sport",
        "edit_exercise",
        {
            "exercise_id": exercise["id"],
            "payload": {"expected_version": exercise["version"], "name": "Renommé", "kind": "reps"},
        },
    )
    assert session["entries"][0]["name"] == "Pompes"
    session = invoke(
        app,
        "sport",
        "validate_set",
        {
            "session_id": session["id"],
            "entry_index": 0,
            "set_index": 0,
            "payload": {"expected_version": session["version"], "values": {"reps": 12}},
        },
    )
    stale_version = session["version"]
    undo = definition("sport", "undo_set")
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        parameters = undo.input_model.model_validate(
            {
                "session_id": session["id"],
                "entry_index": 0,
                "set_index": 0,
                "payload": {"expected_version": session["version"]},
            }
        )
        assert undo.preview_targets(ActionContext(db, user, APPLICATIONS), parameters) == [
            "Force › Pompes · série 1"
        ]
        other = db.scalar(select(User).where(User.username == "bob"))
        with pytest.raises(HTTPException) as hidden:
            undo.preview_targets(ActionContext(db, other, APPLICATIONS), parameters)
        assert hidden.value.status_code == 404
    session = invoke(
        app,
        "sport",
        "finish_session",
        {
            "session_id": session["id"],
            "payload": {"expected_version": session["version"], "outcome": "completed"},
        },
    )
    assert session["status"] == "completed"
    stored = authenticated_client.get(f"/api/v1/sport/sessions/{session['id']}").json()
    for field in (
        "id",
        "entries",
        "sets",
        "status",
        "version",
        "finished_at",
        "score",
        "score_details",
    ):
        assert stored[field] == session[field]
    assert invoke(app, "sport", "get_active_session") is None
    with pytest.raises(HTTPException) as conflict:
        invoke(
            app,
            "sport",
            "finish_session",
            {
                "session_id": session["id"],
                "payload": {"expected_version": stale_version, "outcome": "completed"},
            },
        )
    assert conflict.value.status_code == 409


def test_sport_measurements_and_settings_share_http_validation(app, authenticated_client):
    assert (
        authenticated_client.put("/api/v1/applications/sport", json={"enabled": True}).status_code
        == 200
    )
    measurement = invoke(
        app,
        "sport",
        "create_measurement",
        {"payload": {"measured_on": "2026-01-01", "weight_kg": 70}},
    )
    assert (
        authenticated_client.get(f"/api/v1/sport/measurements/{measurement['id']}").json()
        == measurement
    )
    for archived in (True, False):
        measurement = invoke(
            app,
            "sport",
            "archive_measurement",
            {
                "measurement_id": measurement["id"],
                "payload": {"expected_version": measurement["version"], "archived": archived},
            },
        )
        assert bool(measurement["archived_at"]) is archived
    settings = invoke(
        app, "sport", "save_settings", {"payload": {"rest_seconds": 30, "expected_version": 1}}
    )
    assert authenticated_client.get("/api/v1/sport/settings").json() == settings
    with pytest.raises(ValidationError):
        invoke(
            app,
            "sport",
            "create_measurement",
            {"payload": {"measured_on": "2026-01-01", "weight_kg": -5}},
        )


def fingerprint(app, name, data):
    action = definition("tasks", name)
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice").with_for_update())
        return action.precondition(
            ActionContext(db, user, APPLICATIONS), action.input_model.model_validate(data)
        )


def test_unversioned_previews_detect_intervening_structure_and_task_changes(
    app, authenticated_client
):
    space = invoke(app, "tasks", "create_workspace", {"payload": {"name": "Projet"}})
    data = {"workspace_id": space["id"], "payload": {"archived": True}}
    first = fingerprint(app, "archive_workspace", data)
    assert fingerprint(app, "archive_workspace", data) == first
    task = invoke(
        app, "tasks", "create_task", {"payload": {"workspace_id": space["id"], "title": "Nouveau"}}
    )
    second = fingerprint(app, "archive_workspace", data)
    assert second != first
    invoke(
        app,
        "tasks",
        "edit_task",
        {
            "task_id": task["id"],
            "payload": {"expected_version": task["version"], "title": "Modifié"},
        },
    )
    assert fingerprint(app, "archive_workspace", data) != second
    order = {"payload": {"ids": [space["id"]]}}
    previous_order = fingerprint(app, "reorder_workspaces", order)
    invoke(app, "tasks", "create_workspace", {"payload": {"name": "Autre"}})
    assert fingerprint(app, "reorder_workspaces", order) != previous_order


def test_preview_savepoint_does_not_persist_domain_events_or_progression(app, authenticated_client):
    space = invoke(app, "tasks", "create_workspace", {"payload": {"name": "Aperçu"}})
    task = invoke(
        app,
        "tasks",
        "create_task",
        {"payload": {"workspace_id": space["id"], "title": "À terminer"}},
    )
    before_history = authenticated_client.get(f"/api/v1/tasks/{task['id']}/events").json()
    before_progression = authenticated_client.get("/api/v1/progression/tasks").json()
    action = definition("tasks", "complete_task")
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice").with_for_update())
        savepoint = db.begin_nested()
        result = action.handler(
            ActionContext(db, user, APPLICATIONS),
            action.input_model.model_validate(
                {
                    "task_id": task["id"],
                    "payload": {"expected_version": task["version"]},
                }
            ),
        )
        assert result.completed_at is not None
        savepoint.rollback()
        db.commit()
    assert authenticated_client.get(f"/api/v1/tasks/{task['id']}").json() == task
    assert authenticated_client.get(f"/api/v1/tasks/{task['id']}/events").json() == before_history
    assert authenticated_client.get("/api/v1/progression/tasks").json() == before_progression
