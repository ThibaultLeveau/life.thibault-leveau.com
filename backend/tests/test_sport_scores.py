"""Behavior of effort/completion scores, frozen references and legacy repair."""

from copy import deepcopy
from math import isfinite
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from test_sport import KIND_VALUES, call, exercise, finish, record, start, workout
from test_sport import client as client

from life_app.apps.sport.models import Training


@pytest.mark.parametrize(("kind", "values"), KIND_VALUES)
def test_first_partial_and_empty_without_targets_always_score(client, kind, values):
    program = workout(client, exercise(client, kind), sets=3)
    empty = finish(client, start(client, program))
    assert empty["score"] == 0
    assert empty["score_details"]["difficulty_percent"] is None
    partial = finish(client, record(client, start(client, program), values, index=1))
    assert partial["score"] == 33.33
    assert partial["score_details"] == {
        "version": 2,
        "planned_sets": 3,
        "completed_sets": 1,
        "completion_percent": 33.33,
        "difficulty_percent": 100,
        "score": 33.33,
    }
    assert partial["baseline_id"] == empty["id"]
    assert all(partial["metrics"][0]["scoring"]["references"])
    again = finish(client, record(client, start(client, program), values))
    assert again["score"] == partial["score"]
    assert (
        again["metrics"][0]["scoring"]["references"]
        == partial["metrics"][0]["scoring"]["references"]
    )
    assert call(client, "GET", f"/sessions/{empty['id']}")["score"] == 0


@pytest.mark.parametrize(
    ("kind", "target", "actual", "expected"),
    [
        ("weight_reps", {"weight_kg": 49, "reps": 10}, {"weight_kg": 59, "reps": 10}, 120),
        ("weight_reps", {"weight_kg": 0, "reps": 10}, {"weight_kg": 0, "reps": 5}, 50),
        ("assisted_reps", {"assistance_kg": 19, "reps": 10}, {"assistance_kg": 9, "reps": 10}, 200),
        ("assisted_reps", {"assistance_kg": 0, "reps": 10}, {"assistance_kg": 0, "reps": 5}, 50),
        ("distance", {"distance_m": 1000}, {"distance_m": 500}, 50),
        ("duration", {"duration_seconds": 60}, {"duration_seconds": 30}, 50),
        (
            "weight_distance",
            {"weight_kg": 9, "distance_m": 50},
            {"weight_kg": 19, "distance_m": 50},
            200,
        ),
        (
            "weight_duration",
            {"weight_kg": 9, "duration_seconds": 60},
            {"weight_kg": 19, "duration_seconds": 30},
            100,
        ),
        ("reps", {"reps": 10}, {"reps": 15}, 150),
    ],
)
def test_measured_effort_and_completion_are_both_visible(client, kind, target, actual, expected):
    program = workout(client, exercise(client, kind), sets=2, target=target)
    saved = finish(client, record(client, start(client, program), actual))
    assert saved["score"] == expected / 2
    assert saved["score_details"]["completion_percent"] == 50
    assert saved["score_details"]["difficulty_percent"] == expected


@pytest.mark.parametrize(
    ("kind", "field"),
    [
        ("distance_duration", "distance_m"),
        ("reps_duration", "reps"),
        ("calories_duration", "calories"),
    ],
)
def test_timed_quantity_and_pace_do_not_reward_shortcuts(client, kind, field):
    program = workout(client, exercise(client, kind), target={field: 100, "duration_seconds": 100})
    scores = []
    for amount, duration in [(50, 50), (50, 25), (50, 0.1), (100, 400)]:
        saved = finish(
            client,
            record(client, start(client, program), {field: amount, "duration_seconds": duration}),
        )
        scores.append(saved["score"])
        assert saved["score_details"]["completion_percent"] == 100
    assert scores == [50, 70.71, 75, 50]


def test_partial_targets_and_references_stay_frozen_after_target_edit(client):
    program = workout(client, sets=2, target={"weight_kg": 49})
    initial = finish(client, record(client, start(client, program), {"weight_kg": 59, "reps": 10}))
    assert initial["score"] == 60
    refs = initial["metrics"][0]["scoring"]["references"]
    assert refs[0]["sources"] == {"weight_kg": "target", "reps": "initial"}
    changed = call(
        client,
        "PUT",
        f"/workouts/{program['id']}",
        {
            "expected_version": program["version"],
            "name": program["name"],
            "entries": [
                {
                    "exercise_id": program["entries"][0]["exercise_id"],
                    "sets": 2,
                    "target": {"weight_kg": 999, "reps": 99},
                }
            ],
        },
    )
    later = finish(
        client, record(client, start(client, changed), {"weight_kg": 59, "reps": 10}, index=1)
    )
    assert later["score"] == 60 and later["baseline_id"] == initial["id"]
    assert later["metrics"][0]["scoring"]["references"] == refs


def test_first_reference_uses_historical_suggestions_only_for_missing_fields(client):
    program = workout(client, sets=2, target={"weight_kg": 49})
    cancelled = finish(
        client, record(client, start(client, program), {"weight_kg": 99, "reps": 10}), "cancelled"
    )
    assert cancelled["score_details"] is None and cancelled["score"] is None
    initial = finish(client, record(client, start(client, program), {"weight_kg": 49, "reps": 5}))
    assert initial["score"] == 25
    reference = initial["metrics"][0]["scoring"]["references"][0]
    assert reference["values"] == {"weight_kg": 49, "reps": 10}
    assert reference["sources"] == {"weight_kg": "target", "reps": "history"}


def test_duplicate_exercises_keep_their_own_references_and_weight_each_set(client):
    ex = exercise(client, "reps")
    program = call(
        client,
        "POST",
        "/workouts",
        {
            "name": "Different targets",
            "entries": [
                {"exercise_id": ex["id"], "sets": 3, "target": {"reps": 10}},
                {"exercise_id": ex["id"], "sets": 1, "target": {"reps": 20}},
            ],
        },
        201,
    )
    saved = finish(client, record(client, start(client, program), {"reps": 10}, entry=1))
    assert saved["score"] == 12.5
    assert saved["score_details"]["difficulty_percent"] == 50
    assert saved["score_details"]["completion_percent"] == 25


def test_extreme_valid_values_produce_finite_score_without_rounding_reference_to_zero(client):
    program = workout(
        client,
        exercise(client, "distance_duration"),
        target={"distance_m": 0.1, "duration_seconds": 604800},
    )
    saved = finish(
        client,
        record(client, start(client, program), {"distance_m": 10000000, "duration_seconds": 0.1}),
    )
    assert saved["score"] == 15000000000 and isfinite(saved["score"])


def test_legacy_repair_is_explicit_owner_scoped_idempotent_and_preserves_history(
    client, app, engine
):
    program = workout(client, sets=2, target={"weight_kg": 49, "reps": 10})
    first = finish(client, record(client, start(client, program), {"weight_kg": 59, "reps": 10}))
    second = finish(client, start(client, program))
    legacy = finish(client, record(client, start(client, program), {"weight_kg": 49, "reps": 10}))
    with Session(engine) as db:
        for data in (first, second, legacy):
            row = db.get(Training, UUID(data["id"]))
            row.metrics = [{k: v for k, v in m.items() if k != "scoring"} for m in row.metrics]
            row.score = 100 if data is legacy else None
            row.baseline_id = None
        db.commit()
        before = {
            r.id: deepcopy(
                {
                    k: getattr(r, k)
                    for k in ("entries", "sets", "started_at", "finished_at", "notes", "version")
                }
            )
            for r in db.scalars(select(Training))
        }
        rewards = db.execute(text("SELECT count(*) FROM progression_rewards")).scalar()
    assert call(client, "GET", f"/sessions/{first['id']}")["score"] is None
    with TestClient(app) as bob:
        login = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        bob.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        bob.put("/api/v1/applications/sport", json={"enabled": True})
        assert call(bob, "POST", "/scores/backfill") == {"updated_sessions": 0}
    csrf = client.headers.pop("X-CSRF-Token")
    call(client, "POST", "/scores/backfill", status=403)
    client.headers["X-CSRF-Token"] = csrf
    assert call(client, "POST", "/scores/backfill") == {"updated_sessions": 2}
    assert call(client, "POST", "/scores/backfill") == {"updated_sessions": 0}
    assert call(client, "GET", f"/sessions/{first['id']}")["score"] == 60
    repaired = call(client, "GET", f"/sessions/{second['id']}")
    assert repaired["score"] == 0 and repaired["baseline_id"] == first["id"]
    kept = call(client, "GET", f"/sessions/{legacy['id']}")
    assert kept["score"] == 100 and kept["score_details"] is None
    with Session(engine) as db:
        assert rewards == db.execute(text("SELECT count(*) FROM progression_rewards")).scalar()
        for row in db.scalars(select(Training)):
            assert {k: getattr(row, k) for k in before[row.id]} == before[row.id]


def test_late_repair_never_uses_future_reference_or_rewrites_new_scores(client, engine):
    program = workout(client, sets=2)
    old = finish(client, record(client, start(client, program), {"weight_kg": 9, "reps": 10}))
    with Session(engine) as db, db.begin():
        row = db.get(Training, UUID(old["id"]))
        row.score = None
        row.metrics = [{k: v for k, v in m.items() if k != "scoring"} for m in row.metrics]
    future = finish(client, record(client, start(client, program), {"weight_kg": 99, "reps": 10}))
    assert future["baseline_id"] is None
    call(client, "POST", "/scores/backfill")
    repaired = call(client, "GET", f"/sessions/{old['id']}")
    assert repaired["score"] == 50 and repaired["baseline_id"] is None
    unchanged = call(client, "GET", f"/sessions/{future['id']}")
    for key in ("score", "score_details", "baseline_id", "metrics"):
        assert unchanged[key] == future[key]


def test_score_integrations_keep_legacy_and_v2_families_separate(client, engine):
    from test_integrations import evaluate

    program = workout(client, target={"weight_kg": 49, "reps": 10})
    old = finish(client, record(client, start(client, program), {"weight_kg": 49, "reps": 10}))
    with Session(engine) as db, db.begin():
        row = db.get(Training, UUID(old["id"]))
        row.metrics = [{k: v for k, v in m.items() if k != "scoring"} for m in row.metrics]
    new = finish(client, record(client, start(client, program), {"weight_kg": 59, "reps": 10}))
    assert new["score"] == 120 and new["baseline_id"] is None
    result = evaluate(client, "score", "sport", {"workout_id": program["id"]}, "average")
    assert result["state"] == "unavailable"
