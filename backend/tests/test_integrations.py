"""Providers exercise real source APIs, historical semantics, ownership and activation."""

from datetime import date, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from test_sport import finish, record, start, workout
from test_tasks import create_space, create_task, mutate

from life_app.core.database import utcnow
from life_app.platform.integrations.periods import utc_window


def evaluate(client, metric, application="tasks", filters=None, aggregation="count", **extra):
    day = utcnow().astimezone(ZoneInfo("Europe/Paris")).date().isoformat()
    result = client.post(
        "/api/v1/integrations/evaluate",
        json={
            "application_id": application,
            "metric_id": metric,
            "since": day,
            "until": day,
            "filters": filters or {},
            "aggregation": aggregation,
            **extra,
        },
    )
    assert result.status_code == 200, result.text
    return result.json()["result"]


def test_provider_catalogue_filters_and_owner_boundary(authenticated_client, app):
    client = authenticated_client
    sources = client.get("/api/v1/integrations").json()
    assert {s["id"] for s in sources} == {"tasks", "sport"}
    assert len(sources[0]["metrics"]) >= 19 and len(sources[1]["metrics"]) >= 31
    assert not sources[1]["enabled"]
    space, _ = create_space(client, "Private")
    assert client.get("/api/v1/integrations/tasks/options/workspace_id").json()["items"] == [
        {"id": space["id"], "label": "Private"}
    ]
    with TestClient(app) as bob:
        login = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        bob.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        assert bob.get("/api/v1/integrations/tasks/options/workspace_id").json()["items"] == []
        day = date.today().isoformat()
        assert (
            bob.post(
                "/api/v1/integrations/evaluate",
                json={
                    "application_id": "tasks",
                    "metric_id": "completed",
                    "since": day,
                    "until": day,
                    "filters": {"workspace_id": space["id"]},
                },
            ).status_code
            == 404
        )
    assert client.get("/api/v1/integrations/sport/options/workout_id").status_code == 409
    day = date.today().isoformat()
    base = {"application_id": "tasks", "metric_id": "completed", "since": day, "until": day}
    for extra in (
        {"metric_id": "unknown"},
        {"aggregation": "sum"},
        {"filters": {"priority": "1"}},
        {"filters": {"workspace_id": True}},
        {"filters": {"recurring": 1}},
        {"timezone": "../invalid"},
        {"since": "9999-01-01"},
    ):
        assert (
            client.post("/api/v1/integrations/evaluate", json={**base, **extra}).status_code == 422
        )
    client.put("/api/v1/applications/tasks", json={"enabled": False})
    assert client.get("/api/v1/integrations/tasks/options/workspace_id").status_code == 409
    assert client.post("/api/v1/integrations/evaluate", json=base).status_code == 409


def test_completion_cycles_undo_lateness_and_manual_rescheduling(authenticated_client):
    c = authenticated_client
    space, _ = create_space(c)
    today = utcnow().astimezone(ZoneInfo("Europe/Paris")).date()
    item = create_task(c, space, due_date=(today - timedelta(days=2)).isoformat())
    item = mutate(c, item, "complete")
    assert evaluate(c, "completed")["value"] == 1
    assert (
        evaluate(c, "completed", filters={"due_state": "late", "workspace_id": space["id"]})[
            "value"
        ]
        == 1
    )
    assert evaluate(c, "late_days", aggregation="average")["value"] == 2
    item = mutate(c, item, "undo-complete")
    assert evaluate(c, "completed")["value"] == 0
    recurring = create_task(
        c, space, recurrence={"rrule": "FREQ=DAILY", "start_date": today.isoformat()}
    )
    recurring = mutate(c, recurring, "complete")
    assert evaluate(c, "completed", filters={"recurring": True})["value"] == 1
    assert evaluate(c, "rescheduled")["value"] == 0
    for offset in range(1, 5):
        response = c.patch(
            f"/api/v1/tasks/{item['id']}",
            json={
                "expected_version": item["version"],
                "due_date": (today + timedelta(days=offset)).isoformat(),
            },
        )
        assert response.status_code == 200, response.text
        item = response.json()
    assert evaluate(c, "rescheduled")["value"] == 4
    assert evaluate(c, "rescheduled_tasks", filters={"reports_more_than": 3})["value"] == 1
    assert evaluate(c, "rescheduled_tasks", filters={"reports_more_than": 4})["value"] == 0
    assert evaluate(c, "open")["value"] == 2
    assert evaluate(c, "open", since="2020-01-01", until="2020-01-01")["state"] == "unavailable"


def test_sport_metrics_filters_zero_missing_and_archived_program(authenticated_client):
    c = authenticated_client
    c.put("/api/v1/applications/sport", json={"enabled": True})
    assert evaluate(c, "completed", "sport")["value"] == 0
    assert evaluate(c, "body_weight_kg", "sport", aggregation="latest")["state"] == "missing"
    program = workout(c, sets=2)
    training = start(c, program)
    training = record(c, training, {"weight_kg": 20, "reps": 8})
    training = record(c, training, {"weight_kg": 25, "reps": 6}, index=1)
    finish(c, training)
    filters = {"workout_id": program["id"]}
    assert evaluate(c, "completed", "sport", filters)["value"] == 1
    assert evaluate(c, "volume_kg", "sport", filters, "sum")["value"] == 310
    assert evaluate(c, "reps", "sport", filters, "sum")["value"] == 14
    assert evaluate(c, "sets", "sport", filters)["value"] == 2
    assert evaluate(c, "weight_kg", "sport", filters, "max")["value"] == 25
    assert evaluate(c, "training_days", "sport", filters)["value"] == 1
    assert evaluate(c, "programs", "sport", filters)["value"] == 1
    assert evaluate(c, "completion_rate", "sport", filters)["value"] == 100
    c.put(
        f"/api/v1/sport/workouts/{program['id']}/archive",
        json={"expected_version": program["version"], "archived": True},
    )
    assert evaluate(c, "completed", "sport", filters)["value"] == 1
    assert c.get("/api/v1/integrations/sport/options/workout_id").json()["total"] == 1
    day = date.today().isoformat()
    assert (
        c.post(
            "/api/v1/integrations/evaluate",
            json={
                "application_id": "sport",
                "metric_id": "completed",
                "since": day,
                "until": day,
                "filters": {"workout_id": str(uuid4())},
            },
        ).status_code
        == 404
    )


@pytest.mark.parametrize("day,hours", [(date(2026, 3, 29), 23), (date(2026, 10, 25), 25)])
def test_local_windows_cross_daylight_saving(day, hours):
    start, end = utc_window(day, day, "Europe/Paris")
    assert (end - start).total_seconds() == hours * 3600


def test_sport_scores_require_comparable_programs_and_private_options(authenticated_client, app):
    c = authenticated_client
    c.put("/api/v1/applications/sport", json={"enabled": True})
    programs = []
    for i in range(2):
        p = workout(c, sets=1)
        programs.append(p)
        run = record(c, start(c, p), {"weight_kg": 20, "reps": 8})
        finish(c, run)
    assert evaluate(c, "score", "sport", aggregation="average")["state"] == "unavailable"
    assert evaluate(c, "score", "sport", {"workout_id": programs[0]["id"]}, "average")["state"] in {
        "ok",
        "missing",
    }
    options = c.get(f"/api/v1/integrations/sport/options/workout_id?q={programs[0]['id']}").json()
    assert options["items"] == [{"id": programs[0]["id"], "label": "Séance A"}]
    with TestClient(app) as bob:
        login = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        bob.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        bob.put("/api/v1/applications/sport", json={"enabled": True})
        assert bob.get("/api/v1/integrations/sport/options/workout_id").json()["total"] == 0
        day = utcnow().astimezone(ZoneInfo("Europe/Paris")).date().isoformat()
        response = bob.post(
            "/api/v1/integrations/evaluate",
            json={
                "application_id": "sport",
                "metric_id": "completed",
                "since": day,
                "until": day,
                "filters": {"workout_id": programs[0]["id"]},
            },
        )
        assert response.status_code == 404
