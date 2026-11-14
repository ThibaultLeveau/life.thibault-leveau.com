"""Sport API parity: types, ownership, snapshots, recovery, scores and lifecycle."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from life_app.apps.sport.models import Training
from life_app.cli import migration_config


@pytest.fixture
def client(authenticated_client):
    assert (
        authenticated_client.put("/api/v1/applications/sport", json={"enabled": True}).status_code
        == 200
    )
    return authenticated_client


def call(client, method, path, data=None, status=200):
    response = client.request(method, "/api/v1/sport" + path, json=data)
    assert response.status_code == status, response.text
    return response.json()


def exercise(client, kind="weight_reps"):
    return call(client, "POST", "/exercises", {"name": "Exercice personnel", "kind": kind}, 201)


def workout(client, ex=None, sets=1, target=None):
    ex = ex or exercise(client)
    return call(
        client,
        "POST",
        "/workouts",
        {
            "name": "Séance A",
            "entries": [{"exercise_id": ex["id"], "sets": sets, "target": target or {}}],
        },
        201,
    )


def start(client, w):
    return call(
        client, "POST", "/sessions", {"workout_id": w["id"], "expected_version": w["version"]}, 201
    )


def record(client, session, values, entry=0, index=0):
    return call(
        client,
        "PUT",
        f"/sessions/{session['id']}/sets/{entry}/{index}",
        {"expected_version": session["version"], "values": values},
    )


def finish(client, session, outcome="completed"):
    return call(
        client,
        "PUT",
        f"/sessions/{session['id']}/finish",
        {"expected_version": session["version"], "outcome": outcome, "notes": "Bonne séance"},
    )


def test_catalogue_search_types_pagination_and_customization(client):
    kinds = call(client, "GET", "/kinds")
    page = call(client, "GET", "/exercises?limit=1000")
    assert page["total"] >= 650
    assert {e["kind"] for e in page["items"]} == {k["id"] for k in kinds}
    assert len({e["id"] for e in page["items"]}) == page["total"]
    for query, kind in [
        ("course sur tapis", "distance_duration"),
        ("developpe couche", "weight_reps"),
        ("farmer", "weight_distance"),
        ("burpees", "reps"),
    ]:
        result = call(client, "GET", f"/exercises?q={query}&kind={kind}")
        assert result["total"] > 0
        assert all(e["kind"] == kind for e in result["items"])
    first = call(client, "GET", "/exercises?limit=3")
    second = call(client, "GET", "/exercises?offset=3&limit=3")
    assert not {e["id"] for e in first["items"]} & {e["id"] for e in second["items"]}
    custom = exercise(client)
    assert not custom["builtin"]
    payload = {key: custom[key] for key in ("name", "kind", "muscle_group", "equipment", "notes")}
    changed = call(
        client,
        "PUT",
        f"/exercises/{custom['id']}",
        {**payload, "name": "Mon mouvement", "expected_version": 1},
    )
    assert changed["version"] == 2
    call(client, "PUT", f"/exercises/{custom['id']}", {**payload, "expected_version": 1}, 409)
    call(client, "POST", "/exercises", {"name": "   ", "kind": "reps"}, 422)
    call(client, "POST", "/exercises", {"name": "Invalid", "kind": "unknown"}, 422)
    call(
        client,
        "POST",
        "/exercises",
        {"name": "Invalid", "kind": "reps", "owner_id": str(uuid4())},
        422,
    )


@pytest.mark.parametrize(
    ("kind", "values"),
    [
        ("weight_reps", {"weight_kg": 60, "reps": 10}),
        ("reps", {"reps": 15}),
        ("assisted_reps", {"assistance_kg": 20, "reps": 10}),
        ("duration", {"duration_seconds": 45}),
        ("distance_duration", {"distance_m": 5000, "duration_seconds": 1800}),
        ("weight_distance", {"weight_kg": 40, "distance_m": 50}),
        ("weight_duration", {"weight_kg": 20, "duration_seconds": 30}),
        ("reps_duration", {"reps": 30, "duration_seconds": 60}),
        ("distance", {"distance_m": 2.4}),
        ("calories_duration", {"calories": 25, "duration_seconds": 60}),
    ],
)
def test_each_type_can_plan_train_and_produce_statistics(client, kind, values):
    w = workout(client, exercise(client, kind), target=values)
    t = start(client, w)
    t = record(client, t, values)
    assert t["sets"][0]["values"] == {**{k: None for k in t["sets"][0]["values"]}, **values}
    done = finish(client, t)
    assert done["status"] == "completed" and done["score"] == 100
    assert done["metrics"][0]["value"] > 0
    stats = call(client, "GET", "/statistics")
    assert stats["completed_sessions"] == 1 and stats["total_sets"] == 1
    assert stats["sessions"][0]["id"] == done["id"]


def test_recovery_versions_correction_restart_and_snapshot(client):
    call(client, "PUT", "/settings", {"rest_seconds": 120})
    ex = exercise(client)
    w = workout(client, ex, sets=2, target={"weight_kg": 30, "reps": 8})
    t = start(client, w)
    call(
        client, "POST", "/sessions", {"workout_id": w["id"], "expected_version": w["version"]}, 409
    )
    t = record(client, t, {"weight_kg": 30, "reps": 8})
    rest = datetime.fromisoformat(t["rest_until"])
    assert 115 < (rest - datetime.now(UTC)).total_seconds() <= 120
    stamp = t["sets"][0]["completed_at"]
    call(
        client,
        "PUT",
        f"/sessions/{t['id']}/sets/0/1",
        {"expected_version": 1, "values": {"weight_kg": 30, "reps": 8}},
        409,
    )
    call(
        client,
        "PUT",
        f"/sessions/{t['id']}/finish",
        {"expected_version": t["version"], "outcome": "completed"},
        409,
    )
    t = record(client, t, {"weight_kg": 35, "reps": 8})
    assert t["rest_until"] == rest.isoformat().replace("+00:00", "Z")
    assert t["sets"][0]["completed_at"] == stamp
    recovered = call(client, "GET", "/sessions/active")
    assert recovered["sets"] == t["sets"] and recovered["rest_until"] == t["rest_until"]
    changed = call(
        client,
        "PUT",
        f"/workouts/{w['id']}",
        {
            "name": "Nouveau nom",
            "notes": "Autre",
            "entries": [{"exercise_id": ex["id"], "sets": 4}],
            "expected_version": w["version"],
        },
    )
    assert changed["entries"][0]["sets"] == 4
    assert call(client, "GET", f"/sessions/{t['id']}")["entries"][0]["sets"] == 2
    t = call(client, "PUT", f"/sessions/{t['id']}/rest", {"expected_version": t["version"]})
    assert t["rest_until"] is None
    call(client, "PUT", "/settings", {"rest_seconds": 0})
    t = record(client, t, {"weight_kg": 35, "reps": 9}, index=1)
    assert datetime.fromisoformat(t["rest_until"]) <= datetime.now(UTC)
    t = call(client, "DELETE", f"/sessions/{t['id']}/sets/0/1", {"expected_version": t["version"]})
    assert len(t["sets"]) == 1 and t["rest_until"] is None
    t = record(client, t, {"weight_kg": 35, "reps": 9}, index=1)
    done = finish(client, t)
    assert done["name"] == "Séance A"
    call(
        client,
        "PUT",
        f"/sessions/{t['id']}/sets/0/0",
        {"expected_version": done["version"], "values": {"weight_kg": 1, "reps": 1}},
        409,
    )
    assert call(client, "GET", "/sessions/active") is None


def test_server_rejects_wrong_type_missing_values_and_invalid_numbers(client):
    ex = exercise(client)
    call(
        client,
        "POST",
        "/workouts",
        {"name": "Bad", "entries": [{"exercise_id": ex["id"], "target": {"distance_m": 30}}]},
        422,
    )
    t = start(client, workout(client, ex))
    for values in (
        {"weight_kg": 10},
        {"reps": 10, "distance_m": 5},
        {"weight_kg": -1, "reps": 10},
        {"weight_kg": 10, "reps": 1.2},
        {"weight_kg": 10, "reps": True},
    ):
        call(
            client,
            "PUT",
            f"/sessions/{t['id']}/sets/0/0",
            {"expected_version": t["version"], "values": values},
            422,
        )
    call(
        client,
        "PUT",
        f"/sessions/{t['id']}/sets/0/3",
        {"expected_version": t["version"], "values": {"weight_kg": 10, "reps": 10}},
        404,
    )
    for seconds in (-1, 3601, 1.5, True):
        call(client, "PUT", "/settings", {"rest_seconds": seconds}, 422)
    assert call(client, "GET", "/settings")["rest_seconds"] == 90
    assert call(client, "GET", f"/sessions/{t['id']}")["sets"] == []


def test_score_references_comparable_sessions_and_ignores_cancelled(client):
    w = workout(client)
    a = finish(client, record(client, start(client, w), {"weight_kg": 49, "reps": 10}))
    b = finish(client, record(client, start(client, w), {"weight_kg": 59, "reps": 10}))
    c = finish(client, record(client, start(client, w), {"weight_kg": 39, "reps": 10}))
    assert a["score"] == 100 and b["score"] == 120 and c["score"] == 80
    assert b["baseline_id"] == a["id"] == c["baseline_id"]
    abandoned = finish(
        client, record(client, start(client, w), {"weight_kg": 199, "reps": 10}), "cancelled"
    )
    assert abandoned["score"] is None and abandoned["sets"]
    stats = call(client, "GET", "/statistics")
    assert stats["completed_sessions"] == 3 and stats["total_volume_kg"] == 1470
    changed = call(
        client,
        "PUT",
        f"/workouts/{w['id']}",
        {
            "name": w["name"],
            "entries": [{"exercise_id": w["entries"][0]["exercise_id"], "sets": 2}],
            "expected_version": w["version"],
        },
    )
    t = record(client, start(client, changed), {"weight_kg": 10, "reps": 5})
    t = finish(client, record(client, t, {"weight_kg": 10, "reps": 5}, index=1))
    assert t["score"] == 100 and t["baseline_id"] is None


def test_measurements_dates_changes_archive_restore_and_stats(client):
    today = datetime.now(UTC).date()
    first = call(
        client,
        "POST",
        "/measurements",
        {"measured_on": str(today - timedelta(days=7)), "weight_kg": 80, "waist_cm": 90},
        201,
    )
    latest = call(
        client,
        "POST",
        "/measurements",
        {"measured_on": str(today), "weight_kg": 79, "waist_cm": 88},
        201,
    )
    call(client, "POST", "/measurements", {"measured_on": str(today), "weight_kg": 82}, 409)
    for data in (
        {"measured_on": str(today)},
        {"measured_on": str(today), "weight_kg": 0},
        {"measured_on": str(today + timedelta(days=1)), "weight_kg": 80},
        {"measured_on": str(today), "body_fat_pct": 100},
    ):
        call(client, "POST", "/measurements", data, 422)
    latest = call(
        client,
        "PUT",
        f"/measurements/{latest['id']}",
        {"expected_version": 1, "measured_on": str(today), "weight_kg": 78.5, "waist_cm": 87},
    )
    stats = call(client, "GET", "/statistics")
    assert [v["weight_kg"] for v in stats["measurements"]] == [80, 78.5]
    archived = call(
        client,
        "PUT",
        f"/measurements/{latest['id']}/archive",
        {"expected_version": latest["version"], "archived": True},
    )
    assert len(call(client, "GET", "/measurements")) == 1
    assert call(client, "GET", "/measurements?archived=true")[0]["weight_kg"] == 78.5
    call(
        client,
        "PUT",
        f"/measurements/{latest['id']}/archive",
        {"expected_version": archived["version"], "archived": False},
    )
    assert len(call(client, "GET", "/statistics")["measurements"]) == 2
    assert (
        call(client, "GET", f"/statistics?since={today}&until={today}")["measurements"][0][
            "weight_kg"
        ]
        == 78.5
    )
    call(client, "GET", f"/statistics?since={today}&until={today - timedelta(days=1)}", status=422)
    assert first["created_at"]


def test_archive_and_disable_preserve_session_workout_settings_and_measurements(client):
    ex = exercise(client)
    w = workout(client, ex)
    t = record(client, start(client, w), {"weight_kg": 25, "reps": 5})
    measure = call(
        client,
        "POST",
        "/measurements",
        {"measured_on": str(datetime.now(UTC).date()), "weight_kg": 75},
        201,
    )
    call(client, "PUT", "/settings", {"rest_seconds": 150})
    for path, obj in [("exercises", ex), ("workouts", w)]:
        archived = call(
            client,
            "PUT",
            f"/{path}/{obj['id']}/archive",
            {"expected_version": obj["version"], "archived": True},
        )
        assert archived["archived_at"]
        restored = call(
            client,
            "PUT",
            f"/{path}/{obj['id']}/archive",
            {"expected_version": archived["version"], "archived": False},
        )
        assert (
            restored["created_at"] == obj["created_at"]
            if "created_at" in obj
            else restored["name"] == obj["name"]
        )
    client.put("/api/v1/applications/sport", json={"enabled": False})
    assert client.get("/api/v1/sport/sessions/active").status_code == 403
    client.put("/api/v1/applications/sport", json={"enabled": True})
    restored = call(client, "GET", "/sessions/active")
    for key in ("entries", "sets", "started_at", "rest_until", "version"):
        assert restored[key] == t[key]
    assert call(client, "GET", "/settings")["rest_seconds"] == 150
    assert call(client, "GET", "/measurements")[0] == measure


def test_owners_and_csrf_on_all_data_families(client, app):
    ex = exercise(client)
    w = workout(client, ex)
    t = start(client, w)
    meas = call(
        client,
        "POST",
        "/measurements",
        {"measured_on": str(datetime.now(UTC).date()), "weight_kg": 70},
        201,
    )
    with TestClient(app) as bob:
        result = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        bob.headers["X-CSRF-Token"] = result.json()["csrf_token"]
        bob.put("/api/v1/applications/sport", json={"enabled": True})
        for path in (f"/exercises/{ex['id']}", f"/workouts/{w['id']}", f"/sessions/{t['id']}"):
            call(bob, "GET", path, status=404)
        for path, obj in [("exercises", ex), ("workouts", w), ("measurements", meas)]:
            call(
                bob,
                "PUT",
                f"/{path}/{obj['id']}/archive",
                {"expected_version": 1, "archived": True},
                404,
            )
        call(bob, "POST", "/sessions", {"workout_id": w["id"], "expected_version": 1}, 404)
        call(
            bob,
            "POST",
            "/workouts",
            {"name": "Cross owner", "entries": [{"exercise_id": ex["id"]}]},
            404,
        )
        call(bob, "PUT", f"/sessions/{t['id']}/rest", {"expected_version": 1}, 404)
        assert call(bob, "GET", "/workouts") == [] and call(bob, "GET", "/measurements") == []
        assert call(bob, "GET", "/sessions")["total"] == 0
        assert call(bob, "GET", "/statistics")["completed_sessions"] == 0
    with TestClient(app) as guest:
        assert guest.get("/api/v1/sport/kinds").status_code == 401
        guest.cookies.update(dict(client.cookies))
        assert guest.put("/api/v1/sport/settings", json={"rest_seconds": 3}).status_code == 403
    assert (
        client.put(
            "/api/v1/sport/settings",
            json={"rest_seconds": 3},
            headers={"Origin": "https://evil.example"},
        ).status_code
        == 403
    )


def test_database_constraints_and_migration_refuse_data_loss(client, engine):
    # Empty sport tables can be removed and rebuilt, leaving auth/activation untouched.
    config = migration_config()
    with engine.begin() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "0005_applications")
        command.upgrade(config, "head")
    w = workout(client)
    t = start(client, w)
    with pytest.raises(RuntimeError, match="Données Sport"), engine.begin() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "0005_applications")
    assert call(client, "GET", f"/sessions/{t['id']}")["id"] == t["id"]
    with pytest.raises(IntegrityError), engine.begin() as conn:
        conn.execute(text("UPDATE sport_sessions SET status='completed'"))
    with pytest.raises(IntegrityError), engine.begin() as conn:
        conn.execute(text("UPDATE sport_sessions SET version=0"))
    with Session(engine) as db:
        original = db.scalar(select(Training))
        assert original.status == "active"
        duplicate = Training(
            owner_id=original.owner_id,
            workout_id=original.workout_id,
            name="Duplicate",
            entries=original.entries,
            signature=original.signature,
        )
        db.add(duplicate)
        with pytest.raises(IntegrityError):
            db.commit()
    with pytest.raises(IntegrityError), engine.begin() as conn:
        conn.execute(text("UPDATE sport_sessions SET owner_id=:owner"), {"owner": uuid4()})
    assert UUID(t["id"])
