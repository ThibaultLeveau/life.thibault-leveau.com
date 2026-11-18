"""Earned actions, levels, quests, shared calendar and additive history over real HTTP/SQL."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from test_sport import finish, start, workout
from test_sport import record as record_set
from test_tasks import create_space, create_task, mutate
from test_tracking import save, tracker

from life_app.apps.registry import APPLICATIONS
from life_app.cli import migration_config
from life_app.platform.auth.models import User
from life_app.platform.progression import models as m
from life_app.platform.progression import service as svc
from life_app.platform.progression.definition import Activity
from life_app.platform.progression.schemas import Settings, Vacation


def get(c, path, status=200):
    response = c.get("/api/v1/progression" + path)
    assert response.status_code == status, response.text
    return response.json()


def enable(c, app_id, value=True):
    response = c.put("/api/v1/applications/" + app_id, json={"enabled": value})
    assert response.status_code == 200, response.text


def test_catalogues_levels_titles_and_shared_access(authenticated_client):
    c = authenticated_client
    assert [s["application_id"] for s in get(c, "")] == ["tasks"]
    for app in APPLICATIONS:
        enable(c, app.id)
        if app.progression is None:
            for suffix in ("", "/quests", "/history"):
                get(c, "/" + app.id + suffix, 404)
            continue
        summary = get(c, "/" + app.id)
        assert summary["xp"] == 0 and summary["level"] == 1
        assert summary["next_level_xp"] == 100 and summary["level_progress"] == 0
        assert summary["rules"] and summary["base_xp"] == app.progression.base_xp
        assert summary["quests_total"] == 60 and summary["quests_earned"] == 0
        assert [t["level"] for t in summary["titles"]] == list(range(10, 101, 10))
        quests = get(c, f"/{app.id}/quests")
        assert len(quests["items"]) == quests["total"] == 60
        assert len({q["id"] for q in quests["items"]}) == 60
        assert all(
            q["target"] > 0 and q["xp"] > 0 and q["name"] and q["description"]
            for q in quests["items"]
        )
    enable(c, "tracking", False)
    assert get(c, "/tasks")["level"] == 1
    for suffix in ("", "/quests", "/history"):
        get(c, "/tracking" + suffix, 403)
    get(c, "/unknown", 404)
    c.put("/api/v1/preferences", json={"locale": "en"})
    assert get(c, "/tasks")["title"] == "Newcomer"
    assert get(c, "/tasks/quests")["items"][0]["description"] != quests["items"][0]["description"]


@pytest.mark.parametrize("level", [1, 2, 9, 10, 20, 50, 99, 100])
def test_level_boundaries(level):
    xp = svc.threshold(level)
    assert svc.level_for(xp) == level
    assert svc.level_for(xp + 1) == level
    if level > 1:
        assert svc.level_for(xp - 1) == level - 1
    assert svc.level_for(10**9) == 100
    assert svc.threshold(100) == 131175
    assert all(
        svc.threshold(n + 1) - svc.threshold(n) < svc.threshold(n + 2) - svc.threshold(n + 1)
        for n in range(1, 99)
    )


def test_tasks_first_confirmation_counts_once_and_recurring_occurrences_count(authenticated_client):
    c = authenticated_client
    space, _ = create_space(c)
    item = mutate(c, create_task(c, space, priority=1, due_date="2099-01-01"), "complete")
    first = get(c, "/tasks")
    history = get(c, "/tasks/history")
    assert [r["xp"] for r in history["items"] if r["kind"] == "activity"] == [10]
    assert first["quests_earned"] == 4  # completed, priority, on time, distinct active day
    assert sum(r["xp"] for r in history["items"]) == first["xp"]
    reopened = mutate(c, item, "reopen")
    mutate(c, reopened, "complete")
    assert get(c, "/tasks")["xp"] == first["xp"]
    assert get(c, "/tasks/history")["total"] == history["total"]
    recurring = create_task(
        c, space, recurrence={"rrule": "FREQ=DAILY", "start_date": "2026-11-01"}
    )
    recurring = mutate(c, recurring, "complete")
    after = get(c, "/tasks")["xp"]
    undone = mutate(c, recurring, "undo-complete")
    recurring = mutate(c, undone, "complete")
    assert get(c, "/tasks")["xp"] == after
    mutate(c, recurring, "complete")
    assert get(c, "/tasks")["xp"] == after + 10


def test_tracking_corrections_do_not_multiply_points_or_quests(authenticated_client):
    c = authenticated_client
    enable(c, "tracking")
    t = tracker(c)
    entry = save(c, t, {"water": 2, "walk": True})
    first = get(c, "/tracking")
    assert first["quests_earned"] == 5
    rewards = get(c, "/tracking/history")
    assert [r["xp"] for r in rewards["items"] if r["kind"] == "activity"] == [40]
    entry = save(c, t, {"water": 0, "walk": False}, entry["version"], False)
    save(c, t, {"water": 2, "walk": True}, entry["version"])
    assert get(c, "/tracking")["xp"] == first["xp"]
    assert get(c, "/tracking/history") == rewards
    enable(c, "tracking", False)
    get(c, "/tracking", 403)
    enable(c, "tracking")
    assert get(c, "/tracking") == first
    earned = get(c, "/tracking/quests?state=earned&limit=2")
    assert len(earned["items"]) == 2 and earned["total"] == 5
    assert all(q["progress"] == q["target"] and q["earned_at"] for q in earned["items"])
    assert get(c, "/tracking/quests?q=xxxx")["total"] == 0
    assert get(c, "/tracking/history?offset=1&limit=2")["items"] == rewards["items"][1:3]


def test_sport_only_performed_sets_and_finished_sessions_award(authenticated_client):
    c = authenticated_client
    enable(c, "sport")
    w = workout(c, sets=3)
    empty = start(c, w)
    finish(c, empty)
    assert get(c, "/sport")["xp"] == 0
    session = record_set(c, start(c, w), {"weight_kg": 40, "reps": 10})
    assert get(c, "/sport")["xp"] == 0
    finish(c, session)
    awards = get(c, "/sport/history")["items"]
    assert [r["xp"] for r in awards if r["kind"] == "activity"] == [65]
    summary = get(c, "/sport")
    assert summary["quests_earned"] == 5
    session = record_set(c, start(c, w), {"weight_kg": 40, "reps": 10})
    finish(c, session, "cancelled")
    assert get(c, "/sport") == summary


@pytest.mark.parametrize("weekends,expected", [(False, (1, 1)), (True, (2, 2))])
def test_streak_weekends_and_today_grace(weekends, expected):
    friday, monday = date(2026, 11, 13), date(2026, 11, 16)
    settings = Settings(exclude_weekends={"tasks": weekends})
    assert svc.streaks({friday, monday}, monday, settings, "tasks") == expected
    assert svc.streaks({friday}, monday, settings, "tasks") == ((1, 1) if weekends else (0, 1))
    assert svc.streaks({friday, monday}, monday + timedelta(days=1), settings, "tasks") == expected


def test_global_vacations_freeze_without_fake_days():
    friday, monday = date(2026, 11, 13), date(2026, 11, 16)
    preferences = Settings(vacations=[Vacation(start=friday + timedelta(days=1), end=monday)])
    for app_id in ("tasks", "sport", "tracking"):
        assert svc.streaks({friday, monday}, monday, preferences, app_id) == (1, 1)
        assert svc.streaks(
            {friday, monday, monday + timedelta(days=1)},
            monday + timedelta(days=1),
            preferences,
            app_id,
        ) == (2, 2)
        assert svc.streaks(set(), monday, preferences, app_id) == (0, 0)
    # A historical best survives a later break; today's missing activity never breaks early.
    assert svc.streaks({friday, friday + timedelta(days=1)}, monday, Settings(), "tasks") == (0, 2)


def test_usage_days_weekly_and_three_days_per_week():
    monday = date(2026, 11, 2)
    preferences = Settings(usage_days={"tracking": [6], "sport": [0, 2, 4]})
    sunday = monday + timedelta(days=6)
    # Weekly tracking: the six other days are neutral, including after the last Sunday.
    days = {sunday, sunday + timedelta(days=7)}
    assert svc.streaks(days, sunday + timedelta(days=13), preferences, "tracking") == (2, 2)
    assert svc.streaks(days, sunday + timedelta(days=14), preferences, "tracking") == (2, 2)
    assert svc.streaks(days, sunday + timedelta(days=15), preferences, "tracking") == (0, 2)
    # An off-schedule confirmation earns XP elsewhere, but cannot validate a missed Sunday.
    assert svc.streaks(
        days | {sunday + timedelta(days=15)},
        sunday + timedelta(days=15),
        preferences,
        "tracking",
    ) == (0, 2)
    practice = {monday + timedelta(days=n) for n in (0, 2, 4, 7)}
    assert svc.streaks(practice, monday + timedelta(days=9), preferences, "sport") == (4, 4)
    assert svc.streaks(practice, monday + timedelta(days=10), preferences, "sport") == (0, 4)
    # Application calendars are independent; Tasks retains the daily default.
    assert svc.streaks(practice, monday + timedelta(days=7), preferences, "tasks") == (1, 1)


def test_usage_days_vacations_override_and_long_history():
    sunday = date(2025, 1, 5)
    last = sunday + timedelta(weeks=100)
    preferences = Settings(
        exclude_weekends={"tracking": True},
        usage_days={"tracking": [6]},
        vacations=[Vacation(start=last - timedelta(days=7), end=last - timedelta(days=7))],
    )
    # Explicit Sunday overrides the old weekend flag; a vacation Sunday does not count.
    days = {sunday + timedelta(weeks=n) for n in range(101)}
    assert svc.streaks(days, last, preferences, "tracking") == (100, 100)
    assert svc.streaks(set(), last, preferences, "tracking") == (0, 0)
    assert svc.streaks({last - timedelta(days=1)}, last, preferences, "tracking") == (0, 0)


def test_settings_validation_csrf_conflicts_and_owners(authenticated_client, app, monkeypatch):
    monkeypatch.setattr(svc, "utcnow", lambda: datetime(2026, 11, 16, 12, tzinfo=UTC))
    c = authenticated_client
    current = get(c, "/settings")
    assert current["version"] == 0
    payload = {
        "expected_version": 0,
        "timezone": "Europe/Paris",
        "exclude_weekends": {"tasks": True},
        "usage_days": {"tasks": [4, 0, 2], "tracking": [6]},
        "vacations": [{"start": "2026-11-16", "end": "2026-11-20"}],
    }
    response = c.put("/api/v1/progression/settings", json=payload)
    assert response.status_code == 200, response.text
    assert get(c, "/settings")["version"] == 1
    assert get(c, "/settings")["usage_days"] == {"tasks": [0, 2, 4], "tracking": [6]}
    assert get(c, "/tasks")["usage_days"] == [0, 2, 4]
    assert get(c, "/tasks")["paused_today"]
    assert c.put("/api/v1/progression/settings", json=payload).status_code == 409
    for extra in (
        {"timezone": "invalid"},
        {"exclude_weekends": {"unknown": True}},
        {"usage_days": {"unknown": [0]}},
        *(
            {"usage_days": {"tasks": days}}
            for days in ([], [0, 0], [-1], [7], [True], [1.5], ["1"], None, list(range(8)))
        ),
        {"usage_days": None},
        {"vacations": [{"start": "2026-12-02", "end": "2026-12-01"}]},
        {
            "vacations": [
                {"start": "2026-11-16", "end": "2026-11-20"},
                {"start": "2026-11-19", "end": "2026-11-23"},
            ]
        },
        {"owner_id": str(uuid4())},
    ):
        assert (
            c.put(
                "/api/v1/progression/settings", json={**payload, "expected_version": 1, **extra}
            ).status_code
            == 422
        )
    with TestClient(app) as other:
        other.cookies.update(c.cookies)
        assert (
            other.put(
                "/api/v1/progression/settings", json={**payload, "expected_version": 1}
            ).status_code
            == 403
        )
        other.cookies.clear()
        for path in ("", "/settings", "/tasks", "/tasks/quests", "/tasks/history"):
            get(other, path, 401)
        login = other.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        other.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        assert get(other, "/settings")["version"] == 0
        assert get(other, "/settings")["usage_days"] == {}
        assert get(other, "/tasks")["usage_days"] == list(range(7))
        assert get(other, "/tasks")["xp"] == 0
        assert get(other, "/tasks/history")["total"] == 0


def test_usage_days_legacy_preferences_and_writes(authenticated_client, app):
    c = authenticated_client
    owner = UUID(c.get("/api/v1/auth/session").json()["user_id"])
    # A JSON document saved by the released image remains readable, without a data migration.
    with app.state.sessions() as db, db.begin():
        db.add(
            m.Preferences(
                owner_id=owner,
                version=1,
                settings={
                    "timezone": "Europe/Paris",
                    "exclude_weekends": {"tasks": True},
                    "vacations": [],
                },
            )
        )
    assert get(c, "/settings")["usage_days"] == {}
    assert get(c, "/tasks")["usage_days"] == [0, 1, 2, 3, 4]
    legacy = {"expected_version": 1, "exclude_weekends": {"tasks": False}}
    assert c.put("/api/v1/progression/settings", json=legacy).status_code == 200
    assert get(c, "/tasks")["usage_days"] == list(range(7))
    custom = {"expected_version": 2, "usage_days": {"tasks": [0, 2, 4]}}
    assert c.put("/api/v1/progression/settings", json=custom).status_code == 200
    legacy.update(expected_version=3, timezone="UTC")
    assert c.put("/api/v1/progression/settings", json=legacy).status_code == 200
    assert get(c, "/settings")["usage_days"] == {"tasks": [0, 2, 4]}
    assert get(c, "/settings")["timezone"] == "UTC"
    enable(c, "tasks", False)
    assert get(c, "/settings")["usage_days"] == {"tasks": [0, 2, 4]}
    enable(c, "tasks")
    assert get(c, "/tasks")["usage_days"] == [0, 2, 4]
    # An explicit empty map resets custom schedules to the legacy/default calendars.
    assert (
        c.put(
            "/api/v1/progression/settings",
            json={
                "expected_version": 4,
                "usage_days": {},
                "exclude_weekends": {"tasks": True},
            },
        ).status_code
        == 200
    )
    assert get(c, "/tasks")["usage_days"] == [0, 1, 2, 3, 4]


def test_usage_days_recalculate_without_rewriting_rewards(authenticated_client, app, monkeypatch):
    c = authenticated_client
    owner = UUID(c.get("/api/v1/auth/session").json()["user_id"])
    now = datetime(2026, 11, 6, 12, tzinfo=UTC)
    monkeypatch.setattr(svc, "utcnow", lambda: now)
    with app.state.sessions() as db, db.begin():
        for day in (2, 4, 6):
            svc.record(
                db,
                db.get(User, owner),
                "tasks",
                APPLICATIONS[0].progression,
                Activity(f"schedule-{day}", now.replace(day=day), 10, {"completed": 1}, {}),
            )
    before = get(c, "/tasks/history")
    assert get(c, "/tasks")["streak"] == 1
    assert (
        c.put(
            "/api/v1/progression/settings",
            json={
                "expected_version": 0,
                "usage_days": {"tasks": [0, 2, 4]},
            },
        ).status_code
        == 200
    )
    summary = get(c, "/tasks")
    assert summary["streak"] == summary["best_streak"] == 3
    assert summary["today_active"] and not summary["paused_today"]
    get(c, "/tasks/quests")
    assert get(c, "/tasks/history") == before
    now = now.replace(day=7)  # Saturday: an extra activity must not extend the streak.
    with app.state.sessions() as db, db.begin():
        svc.record(
            db,
            db.get(User, owner),
            "tasks",
            APPLICATIONS[0].progression,
            Activity("schedule-rest", now, 10, {"completed": 1}, {}),
        )
    summary = get(c, "/tasks")
    assert summary["streak"] == 3 and summary["paused_today"] and summary["today_active"]
    assert summary["active_days"] == 4
    assert summary["xp"] > sum(item["xp"] for item in before["items"])
    earned = get(c, "/tasks/history")
    assert (
        c.put(
            "/api/v1/progression/settings",
            json={
                "expected_version": 1,
                "usage_days": {"tasks": list(range(7))},
            },
        ).status_code
        == 200
    )
    assert get(c, "/tasks/history") == earned


def test_recorded_days_timezone_dst_and_level_cap(authenticated_client, app, monkeypatch):
    c = authenticated_client
    owner = UUID(c.get("/api/v1/auth/session").json()["user_id"])
    instant = datetime(2026, 3, 29, 22, 30, tzinfo=UTC)  # 30 March in Paris, after DST shift.
    monkeypatch.setattr(svc, "utcnow", lambda: instant)
    with app.state.sessions() as db, db.begin():
        user = db.get(User, owner)
        svc.record(
            db,
            user,
            "tasks",
            APPLICATIONS[0].progression,
            Activity("synthetic", instant, 200000, {"completed": 1}, {}),
        )
    summary = get(c, "/tasks")
    assert (
        summary["level"] == 100
        and summary["next_level_xp"] is None
        and summary["level_progress"] == 1
    )
    assert all(t["earned"] for t in summary["titles"]) and summary["today_active"]
    with app.state.sessions() as db:
        activity = db.scalar(select(m.ActivityRecord).where(m.ActivityRecord.owner_id == owner))
        assert activity.day == date(2026, 3, 30)


def test_immutable_ledger_constraints_and_migration_guard(authenticated_client, engine):
    c = authenticated_client
    space, _ = create_space(c)
    task = mutate(c, create_task(c, space), "complete")
    for table in ("progression_activity", "progression_rewards"):
        with pytest.raises(DBAPIError), engine.begin() as db:
            db.execute(text(f"DELETE FROM {table}"))
        with pytest.raises(DBAPIError), engine.begin() as db:
            db.execute(text(f"UPDATE {table} SET xp=xp+1"))
        with pytest.raises(IntegrityError), engine.begin() as db:
            db.execute(text(f"INSERT INTO {table} SELECT * FROM {table}"))
    with pytest.raises(RuntimeError, match="Progression data exists"), engine.begin() as db:
        config = migration_config()
        config.attributes["connection"] = db
        command.downgrade(config, "0009_tracking")
    assert c.get(f"/api/v1/tasks/{task['id']}").status_code == 200
    assert get(c, "/tasks")["xp"] > 0


def test_concurrent_first_confirmation_credits_once(authenticated_client, app):
    c = authenticated_client
    space, _ = create_space(c)
    task = create_task(c, space)

    def complete():
        with TestClient(app) as other:
            other.cookies.update(c.cookies)
            return other.post(
                f"/api/v1/tasks/{task['id']}/complete",
                headers={"X-CSRF-Token": c.headers["X-CSRF-Token"]},
                json={"expected_version": task["version"]},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: complete(), range(2))) == [200, 409]
    assert [r["xp"] for r in get(c, "/tasks/history")["items"] if r["kind"] == "activity"] == [10]


@pytest.mark.usefixtures("legacy_progression")
def test_explicit_history_import_is_owner_scoped_and_idempotent(authenticated_client, app):
    c = authenticated_client
    enable(c, "tracking")
    enable(c, "sport")
    space, _ = create_space(c)
    mutate(c, create_task(c, space), "complete")
    t = tracker(c)
    save(c, t, {"water": 2, "walk": True})
    w = workout(c)
    finish(c, record_set(c, start(c, w), {"weight_kg": 30, "reps": 10}))
    owner = UUID(c.get("/api/v1/auth/session").json()["user_id"])
    assert all(s["xp"] == 0 for s in get(c, ""))
    with app.state.sessions() as db:
        preview = svc.preview_backfill(db, db.get(User, owner), APPLICATIONS)
        assert [row["activities"] for row in preview] == [1, 1, 1, 0, 0]
        assert [row["activity_xp"] for row in preview] == [10, 65, 30, 0, 0]
        assert db.scalar(select(func.count()).select_from(m.Reward)) == 0
    for _ in range(2):
        with app.state.sessions() as db, db.begin():
            user = db.scalar(select(User).where(User.id == owner).with_for_update())
            svc.backfill(db, user, APPLICATIONS)
    assert [r["xp"] for r in get(c, "/tracking/history")["items"] if r["kind"] == "activity"] == [
        30
    ]
    assert [r["xp"] for r in get(c, "/tasks/history")["items"] if r["kind"] == "activity"] == [10]
    assert [r["xp"] for r in get(c, "/sport/history")["items"] if r["kind"] == "activity"] == [65]
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.ImportState)) == sum(
            definition.progression is not None for definition in APPLICATIONS
        )
        assert set(db.scalars(select(m.Reward.owner_id))) == {owner}
