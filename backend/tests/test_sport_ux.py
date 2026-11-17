"""The UX contracts remain owner-scoped, partial, versioned and reproducible via HTTP."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from test_sport import call, exercise, finish, record, start, workout

from life_app.cli import migration_config


@pytest.fixture
def client(authenticated_client):
    assert (
        authenticated_client.put("/api/v1/applications/sport", json={"enabled": True}).status_code
        == 200
    )
    return authenticated_client


def other_client(app):
    other = TestClient(app)
    session = other.post(
        "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
    )
    other.headers["X-CSRF-Token"] = session.json()["csrf_token"]
    assert other.put("/api/v1/applications/sport", json={"enabled": True}).status_code == 200
    return other


def test_views_are_partial_versioned_private_and_preserved(client, app):
    initial = call(client, "GET", "/settings")
    assert initial["workouts_view"] == "grid"
    assert initial["workouts_mobile_view"] == "list"
    changed = call(
        client,
        "PUT",
        "/settings",
        {"workouts_view": "list", "expected_version": initial["version"]},
    )
    assert changed["rest_seconds"] == 90
    assert changed["version"] == initial["version"] + 1
    legacy = call(client, "PUT", "/settings", {"rest_seconds": 180})
    assert legacy["workouts_view"] == "list"
    assert legacy["workouts_mobile_view"] == "list"
    call(
        client,
        "PUT",
        "/settings",
        {"rest_seconds": 30, "expected_version": initial["version"]},
        409,
    )
    for payload in (
        {"workouts_view": "table"},
        {"workouts_view": None},
        {"rest_seconds": None},
        {"views": {}},
        {"expected_version": 0},
    ):
        call(client, "PUT", "/settings", payload, 422)
    assert call(client, "PUT", "/settings", {}) == legacy
    assert client.put("/api/v1/applications/sport", json={"enabled": False}).status_code == 200
    call(client, "GET", "/settings", status=403)
    assert client.put("/api/v1/applications/sport", json={"enabled": True}).status_code == 200
    assert call(client, "GET", "/settings") == legacy
    with other_client(app) as other:
        assert call(other, "GET", "/settings")["workouts_view"] == "grid"
        assert call(other, "GET", "/settings")["rest_seconds"] == 90


def test_catalogue_origin_and_filter_options_cover_all_results(client, app):
    personal = call(
        client,
        "POST",
        "/exercises",
        {
            "name": "ZZZ personnel",
            "kind": "reps",
            "muscle_group": "Groupe unique",
            "equipment": "Matériel unique",
        },
        201,
    )
    assert (
        call(client, "GET", "/exercises?origin=personal&limit=1")["items"][0]["id"]
        == personal["id"]
    )
    assert all(
        item["builtin"]
        for item in call(client, "GET", "/exercises?origin=builtin&limit=1000")["items"]
    )
    filters = call(client, "GET", "/exercises/filters")
    assert {"value": "Groupe unique", "label": "Groupe unique"} in filters["muscles"]
    assert call(client, "GET", "/exercises?origin=personal&muscle=Groupe%20unique")["total"] == 1
    call(client, "GET", "/exercises?origin=invalid", status=422)
    with other_client(app) as other:
        assert call(other, "GET", "/exercises?origin=personal")["total"] == 0
        assert "Groupe unique" not in str(call(other, "GET", "/exercises/filters"))
    call(
        client,
        "PUT",
        f"/exercises/{personal['id']}/archive",
        {"expected_version": 1, "archived": True},
    )
    assert call(client, "GET", "/exercises?origin=personal")["total"] == 0
    assert call(client, "GET", "/exercises?origin=personal&archived=true")["total"] == 1
    assert call(client, "GET", "/exercises/filters?origin=personal")["muscles"] == []


def test_program_search_sort_copy_and_frozen_preparation(client, app):
    ex = exercise(client)
    source = call(
        client,
        "POST",
        "/workouts",
        {
            "name": "Élan",
            "context": "hyrox",
            "competition_date": "2027-04-01",
            "notes": "Préparer deux haltères",
            "entries": [
                {"exercise_id": ex["id"], "sets": 1, "target": {"reps": 5, "weight_kg": 20}}
            ],
        },
        201,
    )
    second = workout(client, ex)
    assert [w["id"] for w in call(client, "GET", "/workouts?q=elan")] == [source["id"]]
    assert call(client, "GET", "/workouts?sort=name")[0]["id"] == source["id"]
    training = start(client, source)
    assert training["preparation_notes"] == source["notes"]
    assert training["context"] == "hyrox"
    assert call(client, "GET", "/workouts?sort=recent")[0]["id"] == source["id"]
    assert (
        call(client, "GET", f"/workouts/{source['id']}")["last_used_at"] == training["started_at"]
    )
    changed = call(
        client,
        "PUT",
        f"/workouts/{source['id']}",
        {
            "name": "Renommé",
            "notes": "Autres consignes",
            "competition_date": source["competition_date"],
            "entries": [{"exercise_id": ex["id"], "sets": 1}],
            "expected_version": source["version"],
        },
    )
    assert changed["context"] == "hyrox"  # Older clients cannot reset explicit context.
    assert (
        call(client, "GET", f"/sessions/{training['id']}")["preparation_notes"] == source["notes"]
    )
    copy = call(
        client,
        "POST",
        f"/workouts/{source['id']}/duplicate",
        {"name": "Ma copie", "expected_version": changed["version"]},
        201,
    )
    assert copy["id"] not in (source["id"], second["id"])
    assert copy["entries"] == changed["entries"]
    assert copy["context"] == "hyrox" and copy["last_used_at"] is None and copy["version"] == 1
    assert call(client, "GET", f"/sessions?workout_id={copy['id']}")["total"] == 0
    assert len(call(client, "GET", f"/workouts?exercise_id={ex['id']}")) == 3
    call(
        client,
        "POST",
        f"/workouts/{source['id']}/duplicate",
        {"name": "Conflit", "expected_version": 1},
        409,
    )
    with other_client(app) as other:
        call(
            other,
            "POST",
            f"/workouts/{source['id']}/duplicate",
            {"name": "Vol", "expected_version": changed["version"]},
            404,
        )
        assert call(other, "GET", f"/workouts?exercise_id={ex['id']}") == []


def test_history_filters_navigation_and_statistics_are_owner_scoped(client, app):
    first_workout = workout(client)
    older = finish(
        client, record(client, start(client, first_workout), {"reps": 5, "weight_kg": 20})
    )
    cancelled = finish(client, start(client, first_workout), "cancelled")
    second_workout = workout(client)
    newer = start(client, second_workout)
    assert call(client, "GET", "/sessions?status=completed")["total"] == 1
    assert call(client, "GET", f"/sessions?workout_id={first_workout['id']}&limit=1")["total"] == 2
    assert call(client, "GET", "/sessions?q=absent")["items"] == []
    assert call(client, "GET", "/sessions?q=%25")["items"] == []  # Literal %, not SQL wildcard.
    nav = call(client, "GET", f"/sessions/{cancelled['id']}/navigation")
    assert nav == {"newer_id": newer["id"], "older_id": older["id"]}
    nav = call(
        client, "GET", f"/sessions/{cancelled['id']}/navigation?workout_id={first_workout['id']}"
    )
    assert nav["newer_id"] is None and nav["older_id"] == older["id"]
    call(client, "GET", "/sessions?since=2026-11-17&until=2026-11-16", status=422)
    call(client, "GET", "/sessions?until=9999-12-31", status=422)
    assert (
        call(client, "GET", f"/statistics?workout_id={first_workout['id']}")["completed_sessions"]
        == 1
    )
    assert (
        call(client, "GET", f"/statistics?baseline_id={older['id']}")["sessions"][0]["id"]
        == older["id"]
    )
    assert call(client, "GET", "/statistics?exercise_id=missing")["sessions"] == []
    baselines = call(client, "GET", "/statistics")["baselines"]
    assert baselines == [
        {
            "id": older["id"],
            "name": older["name"],
            "started_at": older["started_at"],
            "exercise_count": 1,
        }
    ]
    assert older["awarded_xp"] == 65
    assert call(client, "GET", f"/sessions/{older['id']}")["awarded_xp"] is None
    assert cancelled["awarded_xp"] == 0
    rewards = client.get("/api/v1/progression/sport/history").json()["items"]
    assert any(
        reward["kind"] == "activity" and reward["xp"] == older["awarded_xp"] for reward in rewards
    )
    with other_client(app) as other:
        call(other, "GET", f"/sessions/{older['id']}/navigation", status=404)
        assert call(other, "GET", f"/sessions?workout_id={first_workout['id']}")["total"] == 0
        assert call(other, "GET", f"/statistics?baseline_id={older['id']}")["sessions"] == []


def test_rest_adjustment_preserves_recorded_set_and_rejects_stale_or_finished(client, monkeypatch):
    from life_app.apps.sport import service

    training = record(client, start(client, workout(client)), {"weight_kg": 20, "reps": 5})
    now = datetime.fromisoformat(training["server_now"])
    monkeypatch.setattr(service, "utcnow", lambda: now)
    adjusted = call(
        client,
        "PUT",
        f"/sessions/{training['id']}/rest",
        {"expected_version": training["version"], "adjustment_seconds": 15},
    )
    assert datetime.fromisoformat(adjusted["rest_until"]) - datetime.fromisoformat(
        training["rest_until"]
    ) == timedelta(seconds=15)
    assert adjusted["sets"] == training["sets"]
    call(
        client,
        "PUT",
        f"/sessions/{training['id']}/rest",
        {"expected_version": training["version"], "adjustment_seconds": -15},
        409,
    )
    stopped = call(
        client, "PUT", f"/sessions/{training['id']}/rest", {"expected_version": adjusted["version"]}
    )
    assert stopped["rest_until"] is None
    call(
        client,
        "PUT",
        f"/sessions/{training['id']}/rest",
        {"expected_version": stopped["version"], "adjustment_seconds": 15},
        409,
    )
    call(
        client,
        "PUT",
        f"/sessions/{training['id']}/rest",
        {"expected_version": stopped["version"], "adjustment_seconds": 300},
        422,
    )


def test_server_calendar_and_measurement_detail(client, app, monkeypatch):
    from life_app.apps.sport import schemas

    monkeypatch.setattr(schemas, "utcnow", lambda: datetime(2026, 11, 17, 23, 59, tzinfo=UTC))
    assert call(client, "GET", "/settings")["server_today"] == "2026-11-17"
    measurement = call(
        client,
        "POST",
        "/measurements",
        {"measured_on": "2026-11-17", "weight_kg": 70, "waist_cm": 80},
        201,
    )
    assert call(client, "GET", f"/measurements/{measurement['id']}") == measurement
    call(client, "POST", "/measurements", {"measured_on": "2026-11-18", "weight_kg": 70}, 422)
    with other_client(app) as other:
        call(other, "GET", f"/measurements/{measurement['id']}", status=404)


def test_sport_ux_migration_preserves_existing_data_and_guards_downgrade(client, engine):
    source = workout(client)
    training = start(client, source)
    config = migration_config()
    with engine.begin() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "0013_recipe_units")
        command.upgrade(config, "head")
    assert call(client, "GET", f"/sessions/{training['id']}")["entries"] == training["entries"]
    assert call(client, "GET", f"/sessions/{training['id']}")["preparation_notes"] == ""
    call(client, "PUT", "/settings", {"exercises_mobile_view": "grid"})
    with pytest.raises(RuntimeError, match="Sport view preferences"), engine.begin() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "0013_recipe_units")
    assert call(client, "GET", "/settings")["exercises_mobile_view"] == "grid"
    for statement in (
        "UPDATE sport_settings SET version=0",
        "UPDATE sport_settings SET views='[]'",
        "UPDATE sport_workouts SET context='invalid'",
        "UPDATE sport_sessions SET context='invalid'",
    ):
        with pytest.raises(IntegrityError), engine.begin() as conn:
            conn.execute(text(statement))
    call(client, "GET", f"/measurements/{uuid4()}", status=404)
