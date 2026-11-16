"""Real PostgreSQL/HTTP contracts for OKR horizons, history and integrations."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, IntegrityError

from life_app.apps.okr import service
from life_app.cli import migration_config


def enable(c, value=True):
    assert c.put("/api/v1/applications/okr", json={"enabled": value}).status_code == 200


def create(c, **extra):
    r = c.post("/api/v1/okr/objectives", json={"title": "Une vie choisie", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def quarterly(**extra):
    return {
        "horizon": "quarterly",
        "why": "Apprendre",
        "outcome": "Cinq retours clients",
        "first_action": "Inviter un client",
        "start_date": "2026-11-16",
        "due_date": "2026-12-15",
        "key_results": [
            {"title": "Entretiens", "start": 0, "target": 5, "current": 0, "unit": "clients"}
        ],
        **extra,
    }


def move(c, o, status, expected=200, **extra):
    r = c.put(
        f"/api/v1/okr/objectives/{o['id']}/move",
        json={"expected_version": o["version"], "status": status, "position": 0, **extra},
    )
    assert r.status_code == expected, r.text
    return r.json()


def checkin(c, o, value, note="Premier apprentissage"):
    r = c.put(
        f"/api/v1/okr/objectives/{o['id']}/key-results/{o['key_results'][0]['id']}",
        json={"expected_version": o["version"], "value": value, "note": note},
    )
    assert r.status_code == 200, r.text
    return r.json()


def edit(c, o, **extra):
    fields = (
        "title",
        "domain",
        "horizon",
        "parent_id",
        "why",
        "outcome",
        "first_action",
        "start_date",
        "due_date",
        "key_results",
    )
    return c.put(
        f"/api/v1/okr/objectives/{o['id']}",
        json={**{k: o[k] for k in fields}, "expected_version": o["version"], **extra},
    )


def history(c, o):
    return c.get(f"/api/v1/okr/objectives/{o['id']}/history").json()


def metric(c, name="completed", **extra):
    r = c.post(
        "/api/v1/integrations/evaluate",
        json={
            "application_id": "okr",
            "metric_id": name,
            "since": "2026-01-01",
            "until": "2027-12-31",
            **extra,
        },
    )
    assert r.status_code == 200, r.text
    return r.json()["result"]["value"]


def test_progressive_horizons_parentage_and_month_boundaries(authenticated_client):
    c = authenticated_client
    enable(c)
    vision = create(c)
    for payload in (
        {"horizon": "three_year"},
        {"horizon": "annual", "why": "Cap"},
        quarterly(due_date="2026-12-16"),
        quarterly(key_results=[]),
        quarterly(first_action=""),
        quarterly(start_date=None),
        quarterly(due_date="2026-11-15"),
        {"owner_id": str(uuid4())},
    ):
        assert (
            c.post("/api/v1/okr/objectives", json={"title": "Test", **payload}).status_code == 422
        )
    three = create(c, horizon="three_year", why="Liberté", parent_id=vision["id"])
    annual = create(
        c, horizon="annual", why="Apprendre", outcome="Une offre", parent_id=three["id"]
    )
    q = create(c, **quarterly(parent_id=annual["id"]))
    assert q["planned_quarter"] == "2026-Q4" and q["progress"] == 0
    assert (
        c.post(
            "/api/v1/okr/objectives", json={"title": "Test", **quarterly(parent_id=vision["id"])}
        ).status_code
        == 422
    )
    assert edit(c, vision, domain="professional").status_code == 409
    assert edit(c, q, parent_id=q["id"]).status_code == 422
    assert edit(c, annual, **quarterly(parent_id=annual["id"])).status_code == 422
    create(c, **quarterly(start_date="2028-01-31", due_date="2028-02-28"))
    assert (
        c.post(
            "/api/v1/okr/objectives",
            json={
                "title": "Trop long",
                **quarterly(start_date="2028-01-31", due_date="2028-02-29"),
            },
        ).status_code
        == 422
    )
    for result in (
        {"start": 5, "target": 5},
        {"start": 0, "target": 1, "current": True},
        {"start": 0, "target": 1, "current": 1e13},
    ):
        assert (
            c.post(
                "/api/v1/okr/objectives",
                json={"title": "Invalid KR", "key_results": [{"title": "Résultat", **result}]},
            ).status_code
            == 422
        )


def test_completion_quarter_snapshots_reopening_and_no_duplicate_rewards(
    authenticated_client, monkeypatch
):
    c = authenticated_client
    enable(c)
    monkeypatch.setattr(service, "utcnow", lambda: datetime(2026, 12, 31, 23, 30, tzinfo=UTC))
    settings = c.put(
        "/api/v1/okr/settings", json={"timezone": "Europe/Paris", "expected_version": 0}
    ).json()
    assert settings["current_quarter"] == "2027-Q1"
    o = create(c, **quarterly())
    move(c, o, "done", 422)
    o = checkin(c, o, 3)
    assert o["progress"] == 60
    o = checkin(c, o, 5)
    o = move(c, o, "done")
    assert o["completed_quarter"] == "2027-Q1"
    achievement = c.get("/api/v1/okr/achievements?quarter=2027-Q1").json()
    assert (
        achievement["total"] == 1
        and achievement["items"][0]["snapshot"]["key_results"][0]["current"] == 5
    )
    assert metric(c) == 1 and metric(c, "key_results") == 1 and metric(c, "check_ins") == 2
    reward = c.get("/api/v1/progression/okr").json()
    assert reward["xp"] >= 115 and reward["quests_total"] == 60
    assert edit(c, o, title="Cannot edit completed").status_code == 409
    o = move(c, o, "in_progress")
    o = edit(c, o, title="Un nouveau titre", domain="professional").json()
    o = checkin(c, o, 2)
    o = checkin(c, o, 5)
    monkeypatch.setattr(service, "utcnow", lambda: datetime(2027, 4, 1, 12, tzinfo=UTC))
    o = move(c, o, "done")
    assert o["completed_quarter"] == "2027-Q2"
    assert c.get("/api/v1/progression/okr").json()["xp"] == reward["xp"]
    assert metric(c, filters={"domain": "personal"}) == 1
    assert metric(c, filters={"domain": "professional"}) == 0
    old = c.get("/api/v1/okr/achievements?quarter=2027-Q1").json()["items"][0]
    assert old["snapshot"] == achievement["items"][0]["snapshot"] and old["reopened"]
    assert c.get("/api/v1/okr/achievements?quarter=2027-Q2").json()["total"] == 1
    assert any(e["detail"].get("note") == "Premier apprentissage" for e in history(c, o))
    c.put("/api/v1/okr/settings", json={"timezone": "America/Los_Angeles", "expected_version": 1})
    assert c.get(f"/api/v1/okr/objectives/{o['id']}").json()["completed_quarter"] == "2027-Q2"


def test_decreasing_key_results_ordering_and_conflicts(authenticated_client, app):
    c = authenticated_client
    enable(c)
    o = create(
        c, **quarterly(key_results=[{"title": "Réduire", "start": 10, "target": 2, "current": 6}])
    )
    assert o["progress"] == 50
    old = o
    o = checkin(c, o, 0)
    assert o["progress"] == 100
    move(c, old, "in_progress", 409)
    other = create(c, **quarterly())
    other = move(c, other, "backlog")
    ordered = c.get("/api/v1/okr/objectives").json()
    assert ordered[0]["id"] == other["id"]
    o = c.get(f"/api/v1/okr/objectives/{o['id']}").json()

    def complete():
        with TestClient(app) as other:
            other.cookies.update(dict(c.cookies))
            other.headers.update({"X-CSRF-Token": c.headers["X-CSRF-Token"]})
            return other.put(
                f"/api/v1/okr/objectives/{o['id']}/move",
                json={"expected_version": o["version"], "status": "done", "position": 0},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(lambda _: complete(), range(2))) == [200, 409]
    assert metric(c) == 1


def test_auth_owners_archive_and_reactivation_preserve_everything(authenticated_client, app):
    c = authenticated_client
    enable(c)
    o = create(c, **quarterly())
    o = checkin(c, o, 5)
    o = move(c, o, "done")
    o = c.put(
        f"/api/v1/okr/objectives/{o['id']}/archive",
        json={"expected_version": o["version"], "archived": True},
    ).json()
    before = history(c, o)
    enable(c, False)
    assert c.get(f"/api/v1/okr/objectives/{o['id']}").status_code == 403
    assert (
        c.post(
            "/api/v1/integrations/evaluate",
            json={
                "application_id": "okr",
                "metric_id": "completed",
                "since": "2026-01-01",
                "until": "2027-01-01",
            },
        ).status_code
        == 409
    )
    enable(c)
    assert history(c, o) == before
    assert c.get("/api/v1/okr/objectives").json() == []
    assert c.get("/api/v1/okr/objectives?archived=true").json() == [o]
    assert metric(c) == 1
    o = c.put(
        f"/api/v1/okr/objectives/{o['id']}/archive",
        json={"expected_version": o["version"], "archived": False},
    ).json()
    assert o["completed_at"] and o["completed_quarter"]
    with TestClient(app) as other:
        assert other.get("/api/v1/okr/objectives").status_code == 401
        other.cookies.update(dict(c.cookies))
        assert (
            other.put(
                f"/api/v1/okr/objectives/{o['id']}/move",
                json={"expected_version": o["version"], "status": "backlog"},
            ).status_code
            == 403
        )
        login = other.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        ).json()
        other.headers["X-CSRF-Token"] = login["csrf_token"]
        enable(other)
        assert other.get("/api/v1/okr/objectives").json() == []
        assert other.get(f"/api/v1/okr/objectives/{o['id']}/history").status_code == 404
        assert other.get("/api/v1/integrations/okr/options/objective_id").json()["items"] == []
        assert other.get("/api/v1/okr/achievements").json()["items"] == []
        assert other.get("/api/v1/progression/okr").json()["xp"] == 0
        for suffix in ("", "/move", "/archive", f"/key-results/{o['key_results'][0]['id']}"):
            # Supply valid operation contracts so ownership is the reason for refusal.
            data = {"expected_version": o["version"]}
            if suffix == "/move":
                data.update(status="done")
            elif suffix == "/archive":
                data.update(archived=True)
            elif suffix.startswith("/key-results"):
                data.update(value=1)
            else:
                data.update(
                    {
                        k: o[k]
                        for k in (
                            "title",
                            "horizon",
                            "why",
                            "outcome",
                            "first_action",
                            "start_date",
                            "due_date",
                            "key_results",
                        )
                    }
                )
            assert (
                other.put(f"/api/v1/okr/objectives/{o['id']}" + suffix, json=data).status_code
                == 404
            )
        assert metric(other) == 0


def test_additive_migration_constraints_and_history_immutability(authenticated_client, engine):
    c = authenticated_client
    enable(c)
    with engine.begin() as connection:
        config = migration_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "0010_progression")
        command.upgrade(config, "head")
    o = create(c, **quarterly())
    for sql in (
        "UPDATE okr_objectives SET version=0",
        "UPDATE okr_objectives SET domain='invalid'",
        "UPDATE okr_objectives SET due_date=start_date+INTERVAL '2 months'",
        "UPDATE okr_objectives SET status='done'",
        "UPDATE okr_objectives SET parent_id=:id,owner_id=:other",
    ):
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(text(sql), {"id": UUID(o["id"]), "other": uuid4()})
    for sql in ("UPDATE okr_events SET kind='updated'", "DELETE FROM okr_events"):
        with pytest.raises(DBAPIError), engine.begin() as connection:
            connection.execute(text(sql))
    with pytest.raises(RuntimeError, match="OKR data exists"), engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0010_progression")
    assert c.get(f"/api/v1/okr/objectives/{o['id']}").json() == o
