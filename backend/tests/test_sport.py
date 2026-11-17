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

KIND_VALUES = [
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
]


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


@pytest.mark.parametrize(("kind", "values"), KIND_VALUES)
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
    next_session = start(client, w)
    assert next_session["sets"] == [] and next_session["rest_until"] is None
    assert next_session["entries"][0]["suggested_values"] == [done["sets"][0]["values"]]


@pytest.mark.parametrize(("kind", "values"), KIND_VALUES)
def test_finish_unperformed_and_partial_sessions_for_each_type(client, kind, values):
    w = workout(client, exercise(client, kind), sets=2, target=values)
    empty = start(client, w)
    zeros = {key: 0 for key in values}
    # Zero results are produced only by finishing, never by weakening input validation.
    call(
        client,
        "PUT",
        f"/sessions/{empty['id']}/sets/0/0",
        {"expected_version": empty["version"], "values": zeros},
        422,
    )
    done = finish(client, empty)
    assert done["status"] == "completed" and done["version"] == empty["version"] + 1
    assert done["score"] is None and done["baseline_id"] is None
    assert done["metrics"][0]["value"] == 0 and done["rest_until"] is None
    assert len(done["sets"]) == 2
    for result in done["sets"]:
        assert result["skipped"] and result["completed_at"] == done["finished_at"]
        assert {k: v for k, v in result["values"].items() if v is not None} == zeros
    stats = call(client, "GET", "/statistics")
    assert stats["completed_sessions"] == 1 and stats["total_sets"] == 0
    assert stats["total_volume_kg"] == 0 and stats["total_distance_m"] == 0

    full = start(client, w)
    assert full["entries"][0]["suggested_values"] == [None, None]
    full = record(client, record(client, full, values), values, index=1)
    full = finish(client, full)
    assert full["score"] == 100 and full["baseline_id"] is None
    assert all(not s["skipped"] for s in full["sets"])

    partial = record(client, start(client, w), values, index=1)
    assert partial["rest_until"] is not None
    result = finish(client, partial)
    assert result["sets"][1] == partial["sets"][0]  # Values and original timestamp are intact.
    assert result["sets"][0]["skipped"] and result["sets"][0]["values"] == done["sets"][0]["values"]
    assert result["rest_until"] is None and result["baseline_id"] == full["id"]
    # Speed/rate metrics stay unchanged; additive metrics halve when one of two sets is skipped.
    assert result["score"] == (
        100 if kind in {"distance_duration", "reps_duration", "calories_duration"} else 50
    )
    assert call(client, "GET", "/sessions/active") is None
    assert call(client, "GET", f"/sessions/{result['id']}")["sets"] == result["sets"]
    stats = call(client, "GET", "/statistics")
    assert stats["completed_sessions"] == 3 and stats["total_sets"] == 3
    assert stats["total_volume_kg"] == 3 * values.get("weight_kg", 0) * values.get("reps", 0)
    assert stats["total_distance_m"] == 3 * values.get("distance_m", 0)
    for version in (partial["version"], result["version"]):
        call(
            client,
            "PUT",
            f"/sessions/{result['id']}/finish",
            {"expected_version": version, "outcome": "completed"},
            409,
        )
    next_session = start(client, w)
    assert next_session["entries"][0]["suggested_values"] == [s["values"] for s in full["sets"]]
    cancelled = finish(client, next_session, "cancelled")
    assert cancelled["sets"] == [] and cancelled["score"] is None


def test_partial_finish_preserves_history_suggestions_and_zero_score_baselines(client):
    a, b = exercise(client), exercise(client, "duration")
    w = call(
        client,
        "POST",
        "/workouts",
        {
            "name": "Deux exercices",
            "entries": [{"exercise_id": a["id"], "sets": 2}, {"exercise_id": b["id"], "sets": 1}],
        },
        201,
    )
    early = record(client, start(client, w), {"weight_kg": 20, "reps": 10})
    early = finish(client, early)
    assert [m["value"] for m in early["metrics"]] == [210, 0]
    assert early["score"] is None
    full = record(client, start(client, w), {"weight_kg": 30, "reps": 10})
    full = record(client, full, {"weight_kg": 40, "reps": 8}, index=1)
    full = finish(client, record(client, full, {"duration_seconds": 60}, entry=1))
    assert full["score"] == 100 and full["baseline_id"] is None
    partial = record(client, start(client, w), {"weight_kg": 50, "reps": 6}, index=1)
    # Undoing a validation before finishing also makes this set unperformed.
    partial = record(client, partial, {"duration_seconds": 90}, entry=1)
    partial = call(
        client,
        "DELETE",
        f"/sessions/{partial['id']}/sets/1/0",
        {"expected_version": partial["version"]},
    )
    partial = finish(client, partial)
    assert [s["skipped"] for s in partial["sets"]] == [True, False, True]
    assert partial["score"] == round(100 * (306 / 638) / 2, 2)
    assert partial["baseline_id"] == full["id"]
    empty = finish(client, start(client, w))
    assert empty["score"] == 0 and empty["baseline_id"] == full["id"]
    assert call(client, "GET", f"/sessions/{early['id']}")["score"] is None
    expected = [full["sets"][0]["values"], partial["sets"][1]["values"]]
    client.put("/api/v1/applications/sport", json={"enabled": False})
    assert client.get(f"/api/v1/sport/sessions/{partial['id']}").status_code == 403
    client.put("/api/v1/applications/sport", json={"enabled": True})
    restored = call(client, "GET", f"/sessions/{partial['id']}")
    for key in ("sets", "entries", "started_at", "finished_at", "score", "baseline_id", "version"):
        assert restored[key] == partial[key]
    next_session = start(client, w)
    assert next_session["entries"][0]["suggested_values"] == expected
    assert next_session["entries"][1]["suggested_values"] == [full["sets"][2]["values"]]


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
        {"expected_version": 1, "outcome": "completed"},
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


def test_suggestions_keep_latest_recorded_values_per_set_and_preserve_history(client, engine):
    ex = exercise(client)
    w = workout(client, ex, sets=3, target={"weight_kg": 20, "reps": 12})
    first = start(client, w)
    assert first["entries"][0]["suggested_values"] == [None, None, None]
    for i, weight in enumerate([30, 35, 40]):
        first = record(client, first, {"weight_kg": weight, "reps": 12 - i}, index=i)
    first = finish(client, first)
    # Previously published snapshots have no suggested_values key; they still supply results.
    with Session(engine) as db:
        old = db.get(Training, UUID(first["id"]))
        old.entries = [{k: v for k, v in e.items() if k != "suggested_values"} for e in old.entries]
        db.commit()
    first = call(client, "GET", f"/sessions/{first['id']}")
    assert first["entries"][0]["suggested_values"] == []
    second = start(client, w)
    assert second["entries"][0]["suggested_values"] == [s["values"] for s in first["sets"]]
    second = record(client, second, {"weight_kg": 45, "reps": 9}, index=1)
    second = record(client, second, {"weight_kg": 47.5, "reps": 8}, index=1)
    second = record(client, second, {"weight_kg": 100, "reps": 2}, index=2)
    second = call(
        client,
        "DELETE",
        f"/sessions/{second['id']}/sets/0/2",
        {"expected_version": second["version"]},
    )
    second = finish(client, second, "cancelled")
    # An empty abandoned training must not erase recorded results or promote suggestions.
    finish(client, start(client, w), "cancelled")
    current = start(client, w)
    expected = [first["sets"][0]["values"], second["sets"][0]["values"], first["sets"][2]["values"]]
    assert current["entries"][0]["suggested_values"] == expected
    assert current["entries"][0]["target"] == w["entries"][0]["target"]
    assert current["sets"] == [] and current["rest_until"] is None
    assert current["score"] is None and current["metrics"] == []
    current_workout = call(client, "GET", f"/workouts/{w['id']}")
    assert current_workout == {**w, "last_used_at": current_workout["last_used_at"]}
    client.put("/api/v1/applications/sport", json={"enabled": False})
    client.put("/api/v1/applications/sport", json={"enabled": True})
    assert call(client, "GET", "/sessions/active")["entries"] == current["entries"]
    for old in [first, second]:
        reloaded = call(client, "GET", f"/sessions/{old['id']}")
        assert {k: v for k, v in reloaded.items() if k not in {"server_now", "awarded_xp"}} == {
            k: v for k, v in old.items() if k not in {"server_now", "awarded_xp"}
        }


def test_suggestions_match_reordered_exercises_occurrences_and_types(client):
    a, b = exercise(client), exercise(client, "reps")
    w = call(
        client,
        "POST",
        "/workouts",
        {
            "name": "Doublons",
            "entries": [
                {"exercise_id": a["id"], "sets": 2},
                {"exercise_id": b["id"], "sets": 1},
                {"exercise_id": a["id"], "sets": 1},
            ],
        },
        201,
    )
    t = record(client, start(client, w), {"weight_kg": 20, "reps": 10})
    t = record(client, t, {"weight_kg": 25, "reps": 8}, index=1)
    t = record(client, t, {"reps": 30}, entry=1)
    t = finish(client, record(client, t, {"weight_kg": 5, "reps": 20}, entry=2))
    w = call(
        client,
        "PUT",
        f"/workouts/{w['id']}",
        {
            "name": w["name"],
            "expected_version": w["version"],
            "entries": [
                {"exercise_id": b["id"], "sets": 2},
                {"exercise_id": a["id"], "sets": 3},
                {"exercise_id": a["id"], "sets": 1},
            ],
        },
    )
    next_session = start(client, w)
    assert [e["suggested_values"] for e in next_session["entries"]] == [
        [t["sets"][2]["values"], None],
        [t["sets"][0]["values"], t["sets"][1]["values"], None],
        [t["sets"][3]["values"]],
    ]
    finish(client, next_session, "cancelled")
    call(
        client,
        "PUT",
        f"/exercises/{a['id']}",
        {
            "name": a["name"],
            "kind": "reps",
            "expected_version": a["version"],
        },
    )
    next_session = start(client, w)
    assert next_session["entries"][1]["kind"] == "reps"
    assert next_session["entries"][1]["suggested_values"] == [None, None, None]
    assert next_session["entries"][2]["suggested_values"] == [None]


def test_suggestions_do_not_cross_programs_or_owners(client, app):
    ex = call(client, "GET", "/exercises?kind=weight_reps&limit=1")["items"][0]
    w = workout(client, ex)
    finish(client, record(client, start(client, w), {"weight_kg": 50, "reps": 10}))
    assert start(client, workout(client, ex))["entries"][0]["suggested_values"] == [None]
    with TestClient(app) as bob:
        result = bob.post(
            "/api/v1/auth/session",
            json={
                "username": "bob",
                "password": "synthetic-test-password",
            },
        )
        bob.headers["X-CSRF-Token"] = result.json()["csrf_token"]
        bob.put("/api/v1/applications/sport", json={"enabled": True})
        call(bob, "POST", "/sessions", {"workout_id": w["id"], "expected_version": 1}, 404)
        assert start(bob, workout(bob, ex))["entries"][0]["suggested_values"] == [None]


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
        call(
            bob,
            "PUT",
            f"/sessions/{t['id']}/finish",
            {"expected_version": t["version"], "outcome": "completed"},
            404,
        )
        assert call(bob, "GET", "/workouts") == [] and call(bob, "GET", "/measurements") == []
        assert call(bob, "GET", "/sessions")["total"] == 0
        assert call(bob, "GET", "/statistics")["completed_sessions"] == 0
    with TestClient(app) as guest:
        assert guest.get("/api/v1/sport/kinds").status_code == 401
        guest.cookies.update(dict(client.cookies))
        assert guest.put("/api/v1/sport/settings", json={"rest_seconds": 3}).status_code == 403
        assert (
            guest.put(
                f"/api/v1/sport/sessions/{t['id']}/finish",
                json={
                    "expected_version": t["version"],
                    "outcome": "completed",
                },
            ).status_code
            == 403
        )
        assert call(client, "GET", f"/sessions/{t['id']}")["sets"] == []
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


def test_score_averages_ratios_without_adding_incompatible_units(client):
    loaded = exercise(client)
    body = exercise(client, "reps")
    w = call(
        client,
        "POST",
        "/workouts",
        {
            "name": "Mixte",
            "entries": [
                {"exercise_id": loaded["id"], "sets": 1},
                {"exercise_id": body["id"], "sets": 1},
            ],
        },
        201,
    )
    t = record(client, start(client, w), {"weight_kg": 49, "reps": 10})
    first = finish(client, record(client, t, {"reps": 10}, entry=1))
    t = record(client, start(client, w), {"weight_kg": 99, "reps": 10})
    second = finish(client, record(client, t, {"reps": 5}, entry=1))
    assert second["score"] == 125  # Mean of 200% and 50%, not a sum of kg and reps.
    assert second["baseline_id"] == first["id"]
    assisted = workout(client, exercise(client, "assisted_reps"))
    finish(client, record(client, start(client, assisted), {"assistance_kg": 19, "reps": 10}))
    better = finish(
        client, record(client, start(client, assisted), {"assistance_kg": 9, "reps": 10})
    )
    assert better["score"] == 200


def test_empty_measurement_update_and_restore_collision_are_rejected(client):
    today = str(datetime.now(UTC).date())
    first = call(client, "POST", "/measurements", {"measured_on": today, "weight_kg": 70}, 201)
    call(
        client,
        "PUT",
        f"/measurements/{first['id']}",
        {
            "expected_version": 1,
            "measured_on": today,
        },
        422,
    )
    first = call(
        client,
        "PUT",
        f"/measurements/{first['id']}/archive",
        {
            "expected_version": 1,
            "archived": True,
        },
    )
    call(client, "POST", "/measurements", {"measured_on": today, "weight_kg": 71}, 201)
    call(
        client,
        "PUT",
        f"/measurements/{first['id']}/archive",
        {
            "expected_version": first["version"],
            "archived": False,
        },
        409,
    )
    call(client, "GET", "/statistics?since=9999-12-30&until=9999-12-31", status=422)


@pytest.mark.parametrize(
    "invalid_date",
    ["2027-02-29", "2028-13-01", "2028-01-01T00:00:00Z", "20280101", "2028-W01-1", "", 0, True],
)
def test_competition_date_requires_an_iso_civil_date(client, invalid_date):
    payload = {
        "name": "Prépa hYrOx",
        "competition_date": invalid_date,
        "entries": [{"exercise_id": exercise(client)["id"]}],
    }
    call(client, "POST", "/workouts", payload, 422)
    assert call(client, "GET", "/workouts") == []


def test_competition_date_parity_snapshot_and_lifecycle(client, app):
    payload = {
        "name": "Prépa hYrOx",
        "competition_date": "2028-02-29",
        "entries": [{"exercise_id": exercise(client)["id"], "sets": 1}],
    }
    w = call(client, "POST", "/workouts", payload, 201)
    assert w["competition_date"] == "2028-02-29"
    assert call(client, "GET", "/workouts")[0] == w
    t = start(client, w)
    assert t["competition_date"] == w["competition_date"]
    changed = call(
        client,
        "PUT",
        f"/workouts/{w['id']}",
        {**payload, "competition_date": "2029-03-11", "expected_version": 1},
    )
    call(client, "PUT", f"/workouts/{w['id']}", {**payload, "expected_version": 1}, 409)
    # Rename without HYROX keeps the explicitly supplied date; branding is presentation only.
    changed = call(
        client,
        "PUT",
        f"/workouts/{w['id']}",
        {
            **payload,
            "name": "Préparation",
            "competition_date": changed["competition_date"],
            "expected_version": changed["version"],
        },
    )
    for archived in (True, False):
        changed = call(
            client,
            "PUT",
            f"/workouts/{w['id']}/archive",
            {"expected_version": changed["version"], "archived": archived},
        )
        assert changed["competition_date"] == "2029-03-11"
    client.put("/api/v1/applications/sport", json={"enabled": False})
    call(client, "GET", f"/workouts/{w['id']}", status=403)
    client.put("/api/v1/applications/sport", json={"enabled": True})
    assert call(client, "GET", f"/workouts/{w['id']}") == changed
    restored = call(client, "GET", "/sessions/active")
    assert restored["competition_date"] == "2028-02-29" and restored["name"] == payload["name"]
    t = record(client, restored, {"weight_kg": 20, "reps": 10})
    t = finish(client, t)
    assert t["competition_date"] == "2028-02-29"
    assert call(client, "GET", "/sessions")["items"][0]["competition_date"] == "2028-02-29"
    assert call(client, "GET", "/statistics")["sessions"][0]["competition_date"] == "2028-02-29"
    next_session = start(client, changed)
    assert next_session["competition_date"] == "2029-03-11"
    finish(client, next_session, "cancelled")
    with TestClient(app) as bob:
        response = bob.post(
            "/api/v1/auth/session",
            json={
                "username": "bob",
                "password": "synthetic-test-password",
            },
        )
        bob.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        bob.put("/api/v1/applications/sport", json={"enabled": True})
        call(bob, "GET", f"/workouts/{w['id']}", status=404)
        call(bob, "GET", f"/sessions/{t['id']}", status=404)
        call(
            bob,
            "PUT",
            f"/workouts/{w['id']}",
            {**payload, "expected_version": changed["version"]},
            404,
        )
    with TestClient(app) as no_csrf:
        no_csrf.cookies.update(dict(client.cookies))
        call(
            no_csrf,
            "PUT",
            f"/workouts/{w['id']}",
            {**payload, "expected_version": changed["version"]},
            403,
        )
    for change in ({"competition_date": None}, {"competition_date": "2020-01-01"}, {}):
        changed = call(
            client,
            "PUT",
            f"/workouts/{w['id']}",
            {
                "name": "HYROX",
                "entries": payload["entries"],
                "expected_version": changed["version"],
                **change,
            },
        )
        assert changed["competition_date"] == change.get("competition_date")
    assert start(client, changed)["competition_date"] is None
    assert call(client, "GET", f"/sessions/{t['id']}")["competition_date"] == "2028-02-29"


def test_hyrox_migration_preserves_existing_data_and_refuses_date_loss(client, engine):
    w = workout(client)
    t = start(client, w)
    config = migration_config()
    with engine.begin() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "0006_sport")
        assert conn.scalar(text("SELECT name FROM sport_workouts")) == w["name"]
        command.upgrade(config, "head")
    current_workout = call(client, "GET", f"/workouts/{w['id']}")
    assert current_workout == {**w, "last_used_at": current_workout["last_used_at"]}
    restored = call(client, "GET", f"/sessions/{t['id']}")
    assert {k: v for k, v in restored.items() if k not in {"server_now", "awarded_xp"}} == {
        k: v for k, v in t.items() if k not in {"server_now", "awarded_xp"}
    }
    # Each column independently prevents a destructive downgrade, including historical sessions.
    for table in ("sport_workouts", "sport_sessions"):
        with engine.begin() as conn:
            conn.execute(text(f"UPDATE {table} SET competition_date='2028-02-29'"))
        with pytest.raises(RuntimeError, match="dates de compétition"), engine.begin() as conn:
            config.attributes["connection"] = conn
            command.downgrade(config, "0006_sport")
        with engine.begin() as conn:
            assert str(conn.scalar(text(f"SELECT competition_date FROM {table}"))) == "2028-02-29"
            conn.execute(text(f"UPDATE {table} SET competition_date=NULL"))
