"""Language preferences, catalogue identity and historical data preservation via HTTP."""

import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from string import Formatter
from uuid import UUID

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from life_app.apps.registry import APPLICATIONS
from life_app.apps.sport.catalogue import CATALOGUES, DATA, TEXTS
from life_app.apps.sport.models import Training, Workout
from life_app.cli import migration_config
from life_app.core.i18n import negotiate_language


@pytest.fixture
def client(authenticated_client):
    return authenticated_client


def language(client, value):
    result = client.put("/api/v1/preferences", json={"locale": value})
    assert result.status_code == 200, result.text
    return result.json()


def enable_sport(client):
    assert client.put("/api/v1/applications/sport", json={"enabled": True}).status_code == 200


def test_preference_persists_independently_and_is_owner_scoped(client, app):
    assert client.get("/api/v1/preferences").json() == {"theme": "system", "locale": "fr"}
    assert language(client, "en") == {"theme": "system", "locale": "en"}
    assert client.put("/api/v1/preferences", json={"theme": "dark"}).json() == {
        "theme": "dark",
        "locale": "en",
    }
    assert language(client, "fr")["theme"] == "dark"
    language(client, "en")
    assert client.get("/api/v1/auth/session").json()["locale"] == "en"
    with TestClient(app) as other:
        login = other.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        assert login.json()["locale"] == "fr"
        assert other.get("/api/v1/preferences").json()["locale"] == "fr"
    assert client.delete("/api/v1/auth/session").status_code == 204
    login = client.post(
        "/api/v1/auth/session", json={"username": "alice", "password": "synthetic-test-password"}
    )
    assert login.json()["locale"] == "en" and login.json()["theme"] == "dark"


def test_language_validation_and_security(client, app, engine):
    for value in ("es", "en-US", "", None, False, 1):
        assert client.put("/api/v1/preferences", json={"locale": value}).status_code == 422
    with TestClient(app) as guest:
        assert guest.get("/api/v1/preferences").status_code == 401
        guest.cookies.update(client.cookies)
        assert guest.put("/api/v1/preferences", json={"locale": "en"}).status_code == 403
    assert (
        client.put(
            "/api/v1/preferences",
            json={"locale": "en"},
            headers={"Origin": "https://untrusted.example"},
        ).status_code
        == 403
    )
    user = client.get("/api/v1/auth/session").json()["user_id"]
    for value in (None, "xx"):
        with pytest.raises(IntegrityError), engine.begin() as db:
            db.execute(
                text("UPDATE users SET locale=:locale WHERE id=:id"), {"locale": value, "id": user}
            )
    assert client.get("/api/v1/preferences").json()["locale"] == "fr"


def test_anonymous_negotiation_and_authenticated_precedence(client, app):
    with TestClient(app) as guest:
        result = guest.get(
            "/api/v1/auth/session", headers={"Accept-Language": "de;q=1, en-GB;q=0.8, fr;q=0.2"}
        )
        assert result.status_code == 401
        assert result.headers["content-language"] == "en"
        assert result.json()["detail"] == "Sign in to continue."
    language(client, "en")
    result = client.get("/api/v1/applications", headers={"Accept-Language": "fr"})
    assert result.headers["content-language"] == "en"
    assert result.json()[0]["name"] == "Tasks"
    error = client.get("/api/v1/workspaces/00000000-0000-0000-0000-000000000000")
    assert error.status_code == 404
    assert error.json()["detail"] == "Workspace not found."
    assert error.json()["code"] == "apps.tasks.workspace_not_found"
    invalid = client.put("/api/v1/preferences", json={"locale": "es"})
    assert invalid.json()["detail"][0]["msg"] == "This value is not allowed."
    forbidden = client.put(
        "/api/v1/preferences",
        json={"locale": "fr"},
        headers={"X-CSRF-Token": "invalid", "Accept-Language": "fr"},
    )
    assert forbidden.status_code == 403
    assert forbidden.headers["content-language"] == "en"
    assert forbidden.json()["detail"] == "The CSRF token is missing or invalid."
    assert "input" not in invalid.text


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("", "fr"),
        ("en-GB,en;q=0.9", "en"),
        ("en;q=0,fr;q=0.3", "fr"),
        ("en;q=bad, fr", "fr"),
        ("de, en;q=0.5", "en"),
        ("en;q=1.5,fr", "fr"),
        ("fr;q=0.5,en;q=0.5", "fr"),
        ("en;q=NaN", "fr"),
    ],
)
def test_negotiation(header, expected):
    assert negotiate_language(header) == expected


def test_catalogue_completeness_and_messages():
    assert len(DATA) == len({e["id"] for e in DATA}) == 680
    for language_code in ("fr", "en"):
        assert len(CATALOGUES[language_code]) == 680
        assert all(
            e.builtin and e.name and e.muscle_id and e.equipment_id
            for e in CATALOGUES[language_code]
        )
        assert set(TEXTS[language_code]["exercises"]) == {row["id"] for row in DATA}
    for original, translated in zip(CATALOGUES["fr"], CATALOGUES["en"], strict=True):
        assert (original.id, original.kind, original.muscle_id, original.equipment_id) == (
            translated.id,
            translated.kind,
            translated.muscle_id,
            translated.equipment_id,
        )
    assert CATALOGUES["en"][0].name == "Barbell bench press"
    assert CATALOGUES["en"][133].name == "Zottman curl"
    assert CATALOGUES["en"][679].name == "Single-leg resistance band hip adduction"
    formatter = Formatter()
    for path in Path(__file__).parents[1].joinpath("src/life_app").rglob("locales/fr.json"):
        french = json.loads(path.read_text())
        english = json.loads(path.with_name("en.json").read_text())
        assert french.keys() == english.keys(), path
        for key, value in french.items():
            assert english[key], (path, key)

            # English ordinal suffix and month name are additional formatting choices.
            def fields(text):
                return {field for _, field, _, _ in formatter.parse(text) if field}

            assert fields(value) - {"month", "suffix", "month_name"} == fields(english[key]) - {
                "month",
                "suffix",
                "month_name",
            }, (path, key)


def test_default_exercises_localize_without_translating_personal_content(client, engine):
    enable_sport(client)
    original = client.get(
        "/api/v1/sport/exercises", params={"q": "Développé couché à la barre"}
    ).json()["items"][0]
    custom = client.post(
        "/api/v1/sport/exercises",
        json={
            "name": original["name"],
            "kind": "weight_reps",
            "muscle_group": "Mon groupe",
            "equipment": "Mon matériel",
            "notes": "Mes notes personnelles",
        },
    ).json()
    program = client.post(
        "/api/v1/sport/workouts",
        json={
            "name": "Mon programme",
            "competition_date": "2028-03-28",
            "entries": [
                {"exercise_id": original["id"], "sets": 1},
                {"exercise_id": custom["id"], "sets": 1},
            ],
        },
    ).json()
    training = client.post(
        "/api/v1/sport/sessions",
        json={"workout_id": program["id"], "expected_version": program["version"]},
    ).json()
    for index in range(2):
        training = client.put(
            f"/api/v1/sport/sessions/{training['id']}/sets/{index}/0",
            json={"expected_version": training["version"], "values": {"weight_kg": 20, "reps": 10}},
        ).json()
    training = client.put(
        f"/api/v1/sport/sessions/{training['id']}/finish",
        json={"expected_version": training["version"], "outcome": "completed"},
    ).json()
    with Session(engine) as db:
        persisted = db.get(Training, UUID(training["id"]))
        before = (
            json.dumps(persisted.entries),
            json.dumps(persisted.metrics),
            persisted.signature,
            persisted.score,
            persisted.started_at,
            persisted.finished_at,
            persisted.competition_date,
        )
        program_before = json.dumps(db.get(Workout, UUID(program["id"])).entries)
    language(client, "en")
    english = client.get(f"/api/v1/sport/exercises/{original['id']}").json()
    assert english["name"] == "Barbell bench press" and english["builtin"]
    assert english["muscle_group"] == "Chest" and english["equipment"] == "Barbell"
    assert client.get(f"/api/v1/sport/exercises/{custom['id']}").json() == custom
    for url in (
        f"/api/v1/sport/workouts/{program['id']}",
        f"/api/v1/sport/sessions/{training['id']}",
    ):
        result = client.get(url).json()
        assert result["name"] == "Mon programme"
        assert result["competition_date"] == "2028-03-28"
        assert result["entries"][0]["name"] == "Barbell bench press"
        assert result["entries"][1]["name"] == original["name"]
    for url, key in (("/api/v1/sport/sessions", "items"), ("/api/v1/sport/statistics", "sessions")):
        result = client.get(url).json()[key][0]
        assert result["metrics"][0]["name"] == "Barbell bench press"
        assert result["metrics"][1]["name"] == original["name"]
    for muscle in ("chest", "Chest", "Pectoraux"):
        results = client.get(
            "/api/v1/sport/exercises", params={"q": "bench press", "muscle": muscle}
        ).json()
        assert any(e["id"] == original["id"] for e in results["items"])
    assert client.get("/api/v1/sport/kinds").json()[0]["fields"][0]["label"] == "Total weight"
    client.put("/api/v1/applications/sport", json={"enabled": False})
    client.put("/api/v1/applications/sport", json={"enabled": True})
    assert client.get("/api/v1/preferences").json()["locale"] == "en"
    with Session(engine) as db:
        persisted = db.get(Training, UUID(training["id"]))
        assert before == (
            json.dumps(persisted.entries),
            json.dumps(persisted.metrics),
            persisted.signature,
            persisted.score,
            persisted.started_at,
            persisted.finished_at,
            persisted.competition_date,
        )
        assert program_before == json.dumps(db.get(Workout, UUID(program["id"])).entries)
    language(client, "fr")
    assert client.get(f"/api/v1/sport/exercises/{original['id']}").json() == original


def test_locale_migration_preserves_accounts_and_guards_downgrade(client, engine):
    user = client.get("/api/v1/auth/session").json()
    enable_sport(client)
    program = client.post(
        "/api/v1/sport/workouts",
        json={
            "name": "HYROX avant migration",
            "competition_date": "2028-03-28",
            "entries": [{"exercise_id": DATA[0]["id"], "sets": 1}],
        },
    ).json()
    with engine.begin() as db:
        config = migration_config()
        config.attributes["connection"] = db
        command.downgrade(config, "0007_hyrox")
        command.upgrade(config, "head")
    assert client.get("/api/v1/auth/session").json()["user_id"] == user["user_id"]
    assert client.get("/api/v1/auth/session").json()["locale"] == "fr"
    assert client.get(f"/api/v1/sport/workouts/{program['id']}").json() == program
    language(client, "en")
    with pytest.raises(RuntimeError, match="Language preferences"), engine.begin() as db:
        config.attributes["connection"] = db
        command.downgrade(config, "0007_hyrox")
    assert client.get("/api/v1/preferences").json()["locale"] == "en"
    assert (
        client.get(f"/api/v1/sport/workouts/{program['id']}").json()["competition_date"]
        == "2028-03-28"
    )


@pytest.mark.parametrize("value", ["2028-02-30", "2028-03-28T12:00:00Z", 123])
def test_hyrox_date_validation_is_localized(client, value):
    enable_sport(client)
    for locale, message in (
        ("en", "Use a date in YYYY-MM-DD format, without a time."),
        ("fr", "Utilisez une date au format AAAA-MM-JJ, sans heure."),
    ):
        language(client, locale)
        response = client.post(
            "/api/v1/sport/workouts",
            json={
                "name": "HYROX",
                "competition_date": value,
                "entries": [{"exercise_id": DATA[0]["id"], "sets": 1}],
            },
        )
        assert response.status_code == 422
        assert response.headers["content-language"] == locale
        assert response.json()["detail"][0]["msg"] == message
        assert response.json()["detail"][0]["code"] == "apps.sport.competition_date_format"


def test_language_isolation_under_concurrent_requests(client, app):
    language(client, "en")
    with TestClient(app) as bob:
        bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )

        def read(connection, name):
            for _ in range(8):
                assert connection.get("/api/v1/applications").json()[0]["name"] == name

        with ThreadPoolExecutor(max_workers=2) as pool:
            requests = [pool.submit(read, client, "Tasks"), pool.submit(read, bob, "Tâches")]
            for request in requests:
                request.result()


def test_frontend_catalogue_keys_interpolation_and_plurals():
    root = Path(__file__).parents[2] / "frontend/src"
    for directory in (root / "shared", *(root / "apps" / app.id for app in APPLICATIONS)):
        french = json.loads((directory / "locales/fr.json").read_text())
        english = json.loads((directory / "locales/en.json").read_text())
        assert french.keys() == english.keys(), directory
        for key, value in french.items():
            assert value and english[key], (directory, key)
            assert set(re.findall(r"{{(.*?)}}", value)) == set(
                re.findall(r"{{(.*?)}}", english[key])
            ), (directory, key)
            if key.endswith("_one"):
                assert key.removesuffix("_one") + "_other" in french
