"""Tracking API parity, scoring, ownership, snapshots, schedules and safe migrations."""

from datetime import timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError
from test_tasks import create_space, create_task, mutate

from life_app.cli import migration_config
from life_app.core.database import utcnow


@pytest.fixture
def client(authenticated_client):
    assert (
        authenticated_client.put(
            "/api/v1/applications/tracking", json={"enabled": True}
        ).status_code
        == 200
    )
    return authenticated_client


def day():
    return utcnow().astimezone(ZoneInfo("Europe/Paris")).date()


def call(c, method, path, data=None, status=200):
    response = c.request(method, "/api/v1/tracking" + path, json=data)
    assert response.status_code == status, response.text
    return response.json()


def tracker(c, **changes):
    return call(
        c,
        "POST",
        "/trackers",
        {
            "name": "My rhythm",
            "start_date": day().isoformat(),
            "fields": [
                {
                    "id": "water",
                    "label": "Water",
                    "kind": "number",
                    "unit": "L",
                    "goal": {"target": 2, "tolerance": 2},
                },
                {
                    "id": "walk",
                    "label": "Walk",
                    "kind": "boolean",
                    "goal": {"mode": "equals", "target": True},
                },
            ],
            **changes,
        },
        201,
    )


def save(c, t, values, version=0, complete=True, **extra):
    return call(
        c,
        "PUT",
        f"/trackers/{t['id']}/entries/{day()}",
        {"values": values, "expected_version": version, "complete": complete, **extra},
    )


def test_draft_zero_false_score_correction_history_and_points(client):
    c = client
    t = tracker(c)
    call(
        c,
        "PUT",
        f"/trackers/{t['id']}/entries/{day()}",
        {"values": {"water": 0}, "complete": True},
        422,
    )
    first = save(c, t, {"water": 0, "walk": False})
    assert first["score"] == 0 and first["filled"] == 2 and first["xp"] == 10
    before = call(c, "GET", "/achievements")
    assert before["xp"] == 10 and before["completed_periods"] == 1
    assert before["badges"][0]["earned"]
    second = save(c, t, {"water": 2, "walk": True}, first["version"])
    assert second["score"] == 10 and second["xp"] == 30
    assert call(c, "GET", "/achievements")["xp"] == 30
    assert second["completed_at"] == first["completed_at"]
    history = call(c, "GET", f"/trackers/{t['id']}/entries/{day()}/history")
    assert [r["snapshot"]["score"] for r in history] == [10, 0]
    call(
        c,
        "PUT",
        f"/trackers/{t['id']}/entries/{day()}",
        {"values": {"water": 1}, "expected_version": 1},
        409,
    )
    draft = save(c, t, {"water": 1}, second["version"], False)
    assert draft["completed_at"] is None and draft["score"] == 7.5
    assert call(c, "GET", "/achievements")["xp"] == 0
    calendar = call(c, "GET", f"/calendar?since={day()}&until={day()}")
    assert calendar["days"][0]["state"] == "partial"
    assert calendar["days"][0]["score"] == 7.5


def test_definition_edits_do_not_change_saved_or_previous_periods(client):
    c = client
    t = tracker(c, start_date=(day() - timedelta(days=3)).isoformat())
    entry = save(c, t, {"water": 1, "walk": True})
    assert entry["score"] == 7.5
    fields = t["fields"]
    fields[0]["goal"]["target"] = 4
    payload = {
        k: t[k]
        for k in ("name", "description", "frequency", "timezone", "start_date", "color", "fields")
    }
    changed = call(
        c,
        "PUT",
        f"/trackers/{t['id']}",
        {**payload, "fields": fields, "expected_version": t["version"]},
    )
    assert changed["version"] == 2
    assert call(c, "GET", f"/trackers/{t['id']}/entries/{day()}")["entry"]["score"] == 7.5
    old = call(c, "GET", f"/trackers/{t['id']}/entries/{day() - timedelta(days=1)}")
    assert old["definition"]["fields"][0]["goal"]["target"] == 2
    archived = call(
        c, "PUT", f"/trackers/{t['id']}/archive", {"expected_version": 2, "archived": True}
    )
    assert call(c, "GET", "/trackers") == []
    assert call(c, "GET", f"/trackers/{t['id']}/entries/{day()}")["entry"]["score"] == 7.5
    restored = call(
        c,
        "PUT",
        f"/trackers/{t['id']}/archive",
        {"expected_version": archived["version"], "archived": False},
    )
    assert restored["archived_at"] is None
    c.put("/api/v1/applications/tracking", json={"enabled": False})
    assert c.get("/api/v1/tracking/current").status_code == 403
    c.put("/api/v1/applications/tracking", json={"enabled": True})
    assert call(c, "GET", f"/trackers/{t['id']}/entries/{day()}")["entry"] == entry


def test_sources_are_server_calculated_and_snapshots_survive_disable(client):
    c = client
    space, _ = create_space(c)
    task = mutate(c, create_task(c, space), "complete")
    t = tracker(
        c,
        fields=[
            {
                "id": "done",
                "label": "Completed tasks",
                "source": {
                    "application_id": "tasks",
                    "metric_id": "completed",
                    "filters": {"workspace_id": space["id"]},
                },
                "goal": {"target": 2, "tolerance": 2},
            }
        ],
    )
    preview = call(c, "POST", f"/trackers/{t['id']}/entries/{day()}/preview")
    assert preview["sources"]["done"]["result"]["value"] == 1
    call(c, "PUT", f"/trackers/{t['id']}/entries/{day()}", {"values": {"done": 999}}, 422)
    entry = save(c, t, {})
    assert entry["values"]["done"] == 1 and entry["score"] == 5
    mutate(c, task, "undo-complete")
    assert call(c, "GET", f"/trackers/{t['id']}/entries/{day()}")["entry"]["values"]["done"] == 1
    entry = save(c, t, {}, entry["version"], refresh_sources=True)
    assert entry["values"]["done"] == 0 and entry["score"] == 0
    c.put("/api/v1/applications/tasks", json={"enabled": False})
    assert call(c, "GET", f"/trackers/{t['id']}/entries/{day()}")["entry"]["values"]["done"] == 0
    assert (
        call(c, "POST", f"/trackers/{t['id']}/entries/{day()}/preview")["sources"]["done"][
            "result"
        ]["state"]
        == "unavailable"
    )
    call(
        c,
        "PUT",
        f"/trackers/{t['id']}/entries/{day()}",
        {"expected_version": entry["version"], "complete": True, "refresh_sources": True},
        422,
    )
    assert (
        call(c, "GET", f"/trackers/{t['id']}/entries/{day()}")["entry"]["version"]
        == entry["version"]
    )


@pytest.mark.parametrize("frequency", ["daily", "weekly", "monthly", "yearly"])
def test_periods_and_weekday_fields(client, frequency):
    c = client
    t = tracker(c, frequency=frequency)
    current = call(c, "GET", "/current")
    assert current[0]["period_start"] <= str(day()) <= current[0]["period_end"]
    save(c, t, {"water": 2, "walk": True})
    if frequency != "daily":
        assert (
            call(c, "GET", f"/calendar?since={day()}&until={day()}")["days"][0]["state"] == "rest"
        )
    other = (day().weekday() + 1) % 7
    tracker(c, fields=[{"id": "rest", "label": "Rest", "kind": "boolean", "weekdays": [other]}])
    assert len(call(c, "GET", "/current")) == 1


def test_types_goals_validation_and_unavailable_dates(client):
    c = client
    t = tracker(
        c,
        fields=[
            {
                "id": "sleep",
                "label": "Sleep",
                "kind": "duration",
                "goal": {"mode": "between", "target": 420, "upper": 540, "tolerance": 120},
            },
            {
                "id": "reports",
                "label": "Reports",
                "goal": {"mode": "at_most", "target": 0, "tolerance": 4},
            },
            {
                "id": "mood",
                "label": "Mood",
                "kind": "choice",
                "options": ["good", "bad"],
                "goal": {"mode": "equals", "target": "good"},
            },
            {"id": "note", "label": "Note", "kind": "note", "required": False},
        ],
    )
    item = save(c, t, {"sleep": 360, "reports": 2, "mood": "bad"})
    assert t["fields"][0]["unit"] == item["definition"]["fields"][0]["unit"] == "min"
    assert item["score"] == pytest.approx(3.33)
    call(
        c,
        "POST",
        "/trackers",
        {
            "name": "Invalid duration unit",
            "start_date": day().isoformat(),
            "fields": [{"id": "time", "label": "Time", "kind": "duration", "unit": "s"}],
        },
        422,
    )
    for values in ({"sleep": True}, {"sleep": -1}, {"mood": "else"}, {"note": 2}):
        call(
            c,
            "PUT",
            f"/trackers/{t['id']}/entries/{day()}",
            {"values": values, "expected_version": item["version"]},
            422,
        )
    for since, until in [
        ("2100-01-01", "2099-01-01"),
        ("0001-01-01", "0001-01-02"),
        ("2020-01-01", "2022-01-01"),
    ]:
        call(c, "GET", f"/calendar?since={since}&until={until}", status=422)
    call(c, "GET", f"/trackers/{t['id']}/entries/9999-12-31", status=422)
    call(c, "PUT", f"/trackers/{t['id']}/entries/{day() + timedelta(days=1)}", {"values": {}}, 422)


@pytest.mark.usefixtures("legacy_progression")
def test_owner_csrf_constraints_immutable_history_and_migration(client, app, engine):
    c = client
    t = tracker(c)
    entry = save(c, t, {"water": 2, "walk": True})
    with TestClient(app) as other:
        login = other.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        other.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        other.put("/api/v1/applications/tracking", json={"enabled": True})
        assert other.get(f"/api/v1/tracking/trackers/{t['id']}").status_code == 404
        assert (
            other.get(f"/api/v1/tracking/trackers/{t['id']}/entries/{day()}/history").status_code
            == 404
        )
    with TestClient(app) as no_csrf:
        no_csrf.cookies.update(c.cookies)
        assert (
            no_csrf.put(f"/api/v1/tracking/trackers/{t['id']}/entries/{day()}", json={}).status_code
            == 403
        )
    for table in ("tracking_definitions", "tracking_entry_revisions"):
        with pytest.raises(DBAPIError), engine.begin() as db:
            db.execute(text(f"DELETE FROM {table}"))
    with pytest.raises(IntegrityError), engine.begin() as db:
        db.execute(
            text("UPDATE tracking_entries SET owner_id=:owner WHERE id=:id"),
            {"owner": uuid4(), "id": UUID(entry["id"])},
        )
    with pytest.raises(RuntimeError, match="Tracking data exists"), engine.begin() as db:
        config = migration_config()
        config.attributes["connection"] = db
        command.downgrade(config, "0008_locale")
    assert call(c, "GET", f"/trackers/{t['id']}/entries/{day()}")["entry"] == entry


def test_optional_goals_and_nearly_perfect_scores_are_honest(client):
    t = tracker(
        client,
        fields=[
            {"id": "pages", "label": "Pages", "goal": {"target": 100, "tolerance": 100}},
            {
                "id": "bonus",
                "label": "Optional",
                "required": False,
                "goal": {"target": 10, "tolerance": 10},
            },
        ],
    )
    entry = save(client, t, {"pages": 99.99999})
    assert entry["score"] == 9.99
    assert call(client, "GET", "/achievements")["perfect_periods"] == 0
    entry = save(client, t, {"pages": 100}, entry["version"])
    assert entry["score"] == 10
    assert call(client, "GET", "/achievements")["perfect_periods"] == 1


def test_statistics_include_long_periods_and_canonical_start(client):
    t = tracker(client, frequency="yearly")
    current = call(client, "GET", "/current")[0]
    entry = call(
        client,
        "PUT",
        f"/trackers/{t['id']}/entries/{current['period_start']}",
        {
            "values": {"water": 2, "walk": True},
            "complete": True,
        },
    )
    assert entry["score"] == 10
    stats = call(client, "GET", f"/statistics?since={day()}&until={day()}&tracker_id={t['id']}")
    assert stats["completion_rate"] == 100 and stats["average_score"] == 10


def test_empty_migration_roundtrip_preserves_existing_business_data(client, engine):
    space, _ = create_space(client)
    task = create_task(client, space)
    with engine.begin() as db:
        config = migration_config()
        config.attributes["connection"] = db
        command.downgrade(config, "0008_locale")
        command.upgrade(config, "head")
    assert client.get(f"/api/v1/tasks/{task['id']}").json()["title"] == task["title"]
    assert call(client, "GET", "/trackers") == []


def test_long_period_cannot_be_started_before_tracker_start_date(client):
    start = day() + timedelta(days=1)
    t = tracker(client, frequency="yearly", start_date=start.isoformat())
    canonical = start.replace(month=1, day=1)
    call(
        client,
        "PUT",
        f"/trackers/{t['id']}/entries/{canonical}",
        {
            "complete": True,
            "values": {"water": 2, "walk": True},
        },
        status=422,
    )
    call(client, "POST", f"/trackers/{t['id']}/entries/{canonical}/preview", status=422)
