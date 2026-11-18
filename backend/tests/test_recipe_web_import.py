"""Real HTTP/SQL import contracts, with deterministic external browser/AI doubles."""

import json
from datetime import timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr
from sqlalchemy import func, select

from life_app.apps.recipes.models import Ingredient, Recipe, WebImportReceipt
from life_app.core.database import utcnow
from life_app.platform.assistant.credentials import encrypt
from life_app.platform.assistant.models import AssistantSettings
from life_app.platform.assistant.providers import Response
from life_app.platform.auth.models import User

ROOT = "/api/v1/recipes/web-import"
EXTRACTED = {
    "is_recipe": True,
    "title": "Pâtes au citron",
    "servings": 2,
    "instructions": "Cuire les pâtes puis ajouter le citron.",
    "items": [
        {"name": "Citron jaune", "source_text": "1 lemon", "quantity": "1", "unit": "u"},
        {
            "name": "Mon basilic spécial",
            "source_text": "basil to taste",
            "quantity": None,
            "unit": None,
            "note": "Quantité à préciser",
        },
    ],
    "warnings": ["Vérifier la quantité de basilic"],
}


@pytest.fixture
def client(authenticated_client, app):
    client = authenticated_client
    assert client.put("/api/v1/applications/recipes", json={"enabled": True}).status_code == 200
    app.state.settings.assistant_encryption_keys = SecretStr(Fernet.generate_key().decode())
    app.state.settings.recipe_browser_token = SecretStr("synthetic-browser-token-for-tests-only")
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        db.add(
            AssistantSettings(
                user_id=user.id,
                provider="openai",
                model="test-model",
                ciphertext=encrypt(app.state.settings, user.id, "openai", "synthetic"),
            )
        )
        db.commit()

    class FakeProvider:
        def __init__(self, provider, model, token, instructions, messages):
            assert token == "synthetic"
            assert "French" in instructions or "English" in instructions
            assert len(messages) == 1
            app.state.import_prompt = messages[0]["content"]

        def respond(self, tools):
            assert [tool["name"] for tool in tools] == ["submit_result"]
            yield ""
            result = getattr(app.state, "extracted", EXTRACTED)
            return Response(
                calls=[{"id": "result", "name": "submit_result", "arguments": json.dumps(result)}]
            )

    app.state.assistant_provider_factory = FakeProvider
    yield client


def prepare(client, **kwargs):
    return client.post(
        ROOT + "/prepare", json={"text": "Cook pasta with one lemon and fresh basil.", **kwargs}
    )


def saved_payload(draft):
    return {
        **{key: value for key, value in draft.items() if key != "warnings"},
        "items": [
            {
                "ingredient_id": line["ingredient_id"],
                "name": line["name"],
                "quantity": line["quantity"] or "2",
                "unit": line["unit"] or "g",
            }
            for line in draft["items"]
        ],
    }


def test_preview_translates_without_mutation_and_save_is_atomic_and_replayable(client, app):
    before = client.get("/api/v1/recipes/ingredients").json()["total"]
    response = prepare(client, source_url="https://example.com/recipe")
    assert response.status_code == 200, response.text
    draft = response.json()
    assert draft["locale"] == "fr" and draft["title"] == "Pâtes au citron"
    assert draft["items"][0]["ingredient_id"]
    assert draft["items"][1]["quantity"] is None
    assert draft["items"][1]["ingredient_id"] is None
    assert client.get("/api/v1/recipes/ingredients").json()["total"] == before
    assert client.get("/api/v1/recipes/recipes").json()["total"] == 0
    payload = saved_payload(draft)
    response = client.post(ROOT + "/save", json=payload)
    assert response.status_code == 201, response.text
    recipe = response.json()
    assert recipe["source_url"] == "https://example.com/recipe" and recipe["imported_at"]
    assert len(recipe["items"]) == 2
    assert client.post(ROOT + "/save", json=payload).json()["id"] == recipe["id"]
    assert client.get("/api/v1/recipes/recipes").json()["total"] == 1
    assert client.get("/api/v1/recipes/ingredients").json()["total"] == before + 1
    assert client.post(ROOT + "/save", json={**payload, "title": "Changed"}).status_code == 409
    history = client.get(f"/api/v1/recipes/recipes/{recipe['id']}/history").json()
    assert len(history) == 1 and history[0]["snapshot"]["source_url"] == recipe["source_url"]


def test_save_rollback_does_not_leak_new_ingredients(client, app):
    payload = saved_payload(prepare(client).json())
    payload["items"].reverse()  # new private ingredient would be created first
    payload["items"][1]["ingredient_id"] = str(uuid4())
    assert client.post(ROOT + "/save", json=payload).status_code == 404
    with app.state.sessions() as db:
        assert (
            db.scalar(
                select(func.count()).select_from(Ingredient).where(Ingredient.owner_id.is_not(None))
            )
            == 0
        )
        assert db.scalar(select(func.count()).select_from(Recipe)) == 0
        assert db.scalar(select(func.count()).select_from(WebImportReceipt)) == 0


def test_language_and_no_recipe_are_explicit(client, app):
    draft = prepare(client).json()
    client.put("/api/v1/preferences", json={"locale": "en"})
    assert client.post(ROOT + "/save", json=saved_payload(draft)).status_code == 409
    assert prepare(client).json()["locale"] == "en"
    app.state.extracted = {**EXTRACTED, "is_recipe": False, "items": []}
    result = prepare(client)
    assert result.status_code == 422 and "No single usable recipe" in result.json()["detail"]


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "javascript:alert(1)",
        "https://a:b@example.com",
        "https://example.com:8000",
        "https://example.com/\nattack",
    ],
)
def test_reject_invalid_source_urls_before_network(client, url):
    assert client.post(ROOT + "/sessions", json={"id": str(uuid4()), "url": url}).status_code == 422
    assert prepare(client, source_url=url).status_code == 422


def test_bad_model_output_cannot_trigger_actions_or_create_recipe(client, app):
    app.state.extracted = {
        **EXTRACTED,
        "items": [{"name": "Salt", "source_text": "to taste", "quantity": "NaN", "unit": "u"}],
    }
    assert prepare(client).status_code == 502
    assert client.get("/api/v1/recipes/recipes").json()["total"] == 0


@pytest.mark.parametrize("locale, warning", [("fr", "champs vides"), ("en", "empty fields")])
def test_ai_ranges_remain_editable_unknowns_without_guessing_or_loosening_save(
    client, app, locale, warning
):
    client.put("/api/v1/preferences", json={"locale": locale})
    app.state.extracted = {
        **EXTRACTED,
        "servings": "2–3",
        "items": [
            {"name": "Bread", "source_text": "2–3 slices bread", "quantity": "2–3", "unit": "u"},
            {
                "name": "Cinnamon",
                "source_text": "¼–1 tsp cinnamon",
                "quantity": "¼–1",
                "unit": "tsp",
            },
            {"name": "Salt", "source_text": "1/2 tsp salt", "quantity": "0.5", "unit": "tsp"},
        ],
        "warnings": [],
    }
    response = prepare(client)
    assert response.status_code == 200, response.text
    draft = response.json()
    assert draft["servings"] is None
    assert [item["quantity"] for item in draft["items"]] == [None, None, "0.5"]
    assert draft["items"][0]["source_text"] == "2–3 slices bread"
    assert draft["items"][1]["source_text"] == "¼–1 tsp cinnamon"
    assert any(warning in value for value in draft["warnings"])
    assert client.get("/api/v1/recipes/recipes").json()["total"] == 0
    payload = {**saved_payload(draft), "servings": 2}
    payload["items"][0]["quantity"] = "2–3"
    assert client.post(ROOT + "/save", json=payload).status_code == 422
    assert client.get("/api/v1/recipes/recipes").json()["total"] == 0
    payload["items"][0]["quantity"] = "2"
    assert client.post(ROOT + "/save", json=payload).status_code == 201


def test_browser_identity_lease_and_page_version_are_forwarded(client, app):
    identifier = str(uuid4())
    requests = []

    def browser(request):
        requests.append(request)
        assert request.headers["authorization"] == "Bearer synthetic-browser-token-for-tests-only"
        UUID(request.headers["x-recipe-owner"])
        assert len(request.headers["x-recipe-login"]) == 64
        if request.url.path.endswith("/source"):
            assert json.loads(request.content) == {"document": 3}
            return httpx.Response(
                200,
                json={
                    "url": "https://example.com/recipe",
                    "title": "Lemon pasta",
                    "text": "Recipe",
                    "recipes": [],
                    "truncated": False,
                },
            )
        return httpx.Response(
            200,
            json={
                "id": identifier,
                "url": "https://example.com/recipe",
                "title": "Recipe",
                "document": 3,
                "width": 1024,
                "height": 720,
                "image": "cGl4ZWxz",
                "expires_at": (utcnow() + timedelta(minutes=10)).isoformat(),
            },
        )

    app.state.recipe_browser_transport = httpx.MockTransport(browser)
    assert (
        client.post(
            ROOT + "/sessions", json={"id": identifier, "url": "https://example.com/recipe"}
        ).status_code
        == 201
    )
    assert client.get(ROOT + f"/sessions/{identifier}/frame").status_code == 200
    result = client.post(ROOT + "/prepare", json={"session_id": identifier, "document": 3})
    assert result.status_code == 200, result.text
    assert result.json()["source_title"] == "Lemon pasta"
    assert "expires_at" in json.loads(requests[0].content)


def test_all_new_routes_respect_activation_and_csrf(client):
    identifier = str(uuid4())
    routes = [
        ("POST", "/sessions", {"id": identifier, "url": "https://example.com"}),
        ("GET", f"/sessions/{identifier}/frame", None),
        ("POST", f"/sessions/{identifier}/input", {"action": "key", "key": "Tab", "document": 0}),
        ("DELETE", f"/sessions/{identifier}", None),
        ("POST", "/prepare", {"text": "A sufficiently long recipe source text."}),
        ("POST", "/save", saved_payload(prepare(client).json())),
    ]
    csrf = client.headers.pop("X-CSRF-Token")
    for method, path, data in routes:
        if method != "GET":
            assert client.request(method, ROOT + path, json=data).status_code == 403
    client.headers["X-CSRF-Token"] = csrf
    client.put("/api/v1/applications/recipes", json={"enabled": False})
    for method, path, data in routes:
        response = client.request(method, ROOT + path, json=data)
        assert response.status_code == 403, response.text
        assert response.headers["X-Life-Application-Disabled"] == "recipes"


def test_foreign_ingredient_and_receipt_are_isolated(client, app):
    from life_app.apps.recipes.models import Ingredient

    with app.state.sessions() as db:
        bob = db.scalar(select(User).where(User.username == "bob"))
        ingredient = Ingredient(
            owner_id=bob.id,
            name_fr="Secret Bob",
            name_en="Secret Bob",
            unit="g",
            normalized_name="secret bob",
            search_text="secret bob",
        )
        db.add(ingredient)
        db.commit()
        foreign_id = str(ingredient.id)
    draft = prepare(client).json()
    assert "Secret Bob" not in app.state.import_prompt
    payload = saved_payload(draft)
    payload["items"][0]["ingredient_id"] = foreign_id
    assert client.post(ROOT + "/save", json=payload).status_code == 404
    payload = saved_payload(draft)
    saved = client.post(ROOT + "/save", json=payload).json()
    client.put("/api/v1/applications/recipes", json={"enabled": False})
    client.put("/api/v1/applications/recipes", json={"enabled": True})
    assert client.post(ROOT + "/save", json=payload).json()["id"] == saved["id"]
    assert client.get(f"/api/v1/recipes/recipes/{saved['id']}").json()["source_title"] == ""


@pytest.mark.parametrize("revoke", ["session", "activation", "language"])
def test_browser_reply_is_discarded_after_access_changes(client, app, revoke):
    from sqlalchemy import delete

    from life_app.platform.applications.models import ApplicationPreference
    from life_app.platform.auth.models import LoginSession

    identifier = str(uuid4())
    closed = []

    def browser(request):
        if request.method == "DELETE":
            closed.append(request.url.path)
            return httpx.Response(200, json={"ok": True})
        # The network call must not retain the owner SQL lock.
        with app.state.sessions() as db:
            user = db.scalar(
                select(User).where(User.username == "alice").with_for_update(nowait=True)
            )
            if revoke == "session":
                db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
            elif revoke == "activation":
                row = db.get(ApplicationPreference, (user.id, "recipes"))
                row.enabled = False
            else:
                user.locale = "en"
            db.commit()
        return httpx.Response(200, json={"id": identifier})

    app.state.recipe_browser_transport = httpx.MockTransport(browser)
    response = client.post(
        ROOT + "/sessions", json={"id": identifier, "url": "https://example.com"}
    )
    assert response.status_code == {"session": 401, "activation": 403, "language": 409}[revoke]
    assert closed == [f"/sessions/{identifier}"]


def test_ai_rechecks_revocation_and_never_writes(client, app):
    from sqlalchemy import delete

    from life_app.platform.auth.models import LoginSession

    class RevokingProvider:
        def __init__(self, *_args):
            pass

        def respond(self, _tools):
            with app.state.sessions() as db:
                user = db.scalar(
                    select(User).where(User.username == "alice").with_for_update(nowait=True)
                )
                db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
                db.commit()
            yield ""
            return Response(calls=[{"name": "submit_result", "arguments": json.dumps(EXTRACTED)}])

    app.state.assistant_provider_factory = RevokingProvider
    assert prepare(client).status_code == 401
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(Recipe)) == 0


@pytest.mark.parametrize(
    "command",
    [
        {"action": "key", "key": "Control+L"},
        {"action": "click"},
        {"action": "reload", "text": "unexpected"},
        {"action": "text", "text": "\x00"},
    ],
)
def test_invalid_browser_commands_are_rejected_before_service(client, command):
    response = client.post(ROOT + f"/sessions/{uuid4()}/input", json={"document": 1, **command})
    assert response.status_code == 422


def test_import_migration_preserves_manual_recipes_on_empty_round_trip(client, app, engine):
    from alembic import command
    from sqlalchemy import inspect, text

    from life_app.cli import migration_config

    item = client.get("/api/v1/recipes/ingredients?q=Citron").json()["items"][0]
    recipe = client.post(
        "/api/v1/recipes/recipes",
        json={
            "title": "Before web imports",
            "servings": 2,
            "instructions": "Mix.",
            "items": [{"ingredient_id": item["id"], "quantity": "1", "unit": "u"}],
        },
    ).json()
    try:
        with engine.begin() as connection:
            config = migration_config()
            config.attributes["connection"] = connection
            command.downgrade(config, "0017_shopping_free_items")
            assert "source_url" not in {
                c["name"] for c in inspect(connection).get_columns("recipes_recipes")
            }
            assert (
                connection.scalar(text("SELECT title FROM recipes_recipes")) == "Before web imports"
            )
    finally:
        with engine.begin() as connection:
            config = migration_config()
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
    assert client.get(f"/api/v1/recipes/recipes/{recipe['id']}").json() == recipe


def test_receipts_prevent_lossy_migration_and_enforce_owner_fk(client, app, engine):
    from alembic import command
    from sqlalchemy.exc import IntegrityError

    from life_app.cli import migration_config

    payload = saved_payload(prepare(client, source_url="https://example.com/recipe").json())
    recipe = client.post(ROOT + "/save", json=payload).json()
    with pytest.raises(RuntimeError, match="Cannot discard"), engine.begin() as connection:
        config = migration_config()
        config.attributes["connection"] = connection
        command.downgrade(config, "0017_shopping_free_items")
    assert client.post(ROOT + "/save", json=payload).json() == recipe
    with pytest.raises(IntegrityError), app.state.sessions() as db, db.begin():
        bob = db.scalar(select(User).where(User.username == "bob"))
        db.add(
            WebImportReceipt(
                owner_id=bob.id,
                import_id=uuid4(),
                recipe_id=UUID(recipe["id"]),
                fingerprint="0" * 64,
            )
        )
        db.flush()
