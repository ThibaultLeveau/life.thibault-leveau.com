"""Real PostgreSQL contract tests for cooking and shopping, including exact totals."""

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from life_app.apps.recipes.models import Ingredient, RecipeItem
from life_app.cli import migration_config


@pytest.fixture
def client(authenticated_client):
    c = authenticated_client
    assert c.put("/api/v1/applications/recipes", json={"enabled": True}).status_code == 200
    return c


def post(c, path, data):
    result = c.post("/api/v1/recipes/" + path, json=data)
    assert result.status_code in (200, 201), result.text
    return result.json()


def put(c, path, obj, **data):
    result = c.put("/api/v1/recipes/" + path, json={"expected_version": obj["version"], **data})
    assert result.status_code == 200, result.text
    return result.json()


def ingredient(c, name="Riz de test", unit="g"):
    return post(c, "ingredients", {"name": name, "unit": unit})


def recipe(c, i, **kw):
    return post(
        c,
        "recipes",
        {
            "title": "Mon risotto",
            "servings": 2,
            "instructions": "Cuire doucement.",
            "items": [{"ingredient_id": i["id"], "quantity": "125.1", "unit": "g"}],
            **kw,
        },
    )


def shopping(c, **kw):
    return post(c, "lists", {"title": "Courses", **kw})


def add(c, obj, i, amount="20.2", unit="g"):
    return post(
        c,
        f"lists/{obj['id']}/items",
        {
            "ingredient_id": i["id"],
            "quantity": amount,
            "unit": unit,
            "expected_version": obj["version"],
        },
    )


def test_bilingual_catalogue_normalization_and_personal_names(client):
    page = client.get("/api/v1/recipes/ingredients?limit=100").json()
    assert page["total"] == 301 and len(page["items"]) == 100
    egg = client.get("/api/v1/recipes/ingredients?q=oeuf").json()["items"][0]
    assert egg["name"] == "Œuf" and egg["unit"] == "u"
    assert ingredient(client, "œuf", "g")["id"] == egg["id"]
    custom = ingredient(client, "  Épice maison  ")
    assert ingredient(client, "epice MAISON")["id"] == custom["id"]
    client.put("/api/v1/preferences", json={"locale": "en"})
    assert client.get("/api/v1/recipes/ingredients?q=oeuf").json()["items"][0]["name"] == "Egg"
    assert (
        client.get("/api/v1/recipes/ingredients?q=epice").json()["items"][0]["name"]
        == "Épice maison"
    )
    assert client.get("/api/v1/recipes/ingredients?q=%").json()["total"] == 0
    assert not custom["builtin"]


def test_recipe_scaling_stacking_units_and_purchased_remainder(client):
    i = ingredient(client)
    r = recipe(client, i)
    scaled = client.get(f"/api/v1/recipes/recipes/{r['id']}?servings=3").json()
    assert Decimal(scaled["items"][0]["quantity"]) == Decimal("187.65")
    assert scaled["base_servings"] == 2 and scaled["servings"] == 3
    assert client.get(f"/api/v1/recipes/recipes/{r['id']}").json() == r
    obj = add(client, shopping(client), i)
    obj = post(
        client,
        f"lists/{obj['id']}/import",
        {
            "expected_version": obj["version"],
            "recipe_id": r["id"],
            "recipe_version": r["version"],
            "servings": 3,
        },
    )
    assert len(obj["items"]) == 1 and Decimal(obj["items"][0]["quantity"]) == Decimal("207.85")
    line = obj["items"][0]
    obj = put(client, f"lists/{obj['id']}/items/{line['id']}/check", obj, checked=True)
    obj = add(client, obj, i, "0.15")
    assert Decimal(obj["items"][0]["quantity"]) == 208
    assert Decimal(obj["items"][0]["purchased_quantity"]) == Decimal("207.85")
    assert not obj["items"][0]["checked"]
    obj = add(client, obj, i, "1", "u")
    assert len(obj["items"]) == 2
    assert (
        client.post(
            f"/api/v1/recipes/lists/{obj['id']}/items",
            json={"ingredient_id": i["id"], "quantity": 1, "unit": "g", "expected_version": 1},
        ).status_code
        == 409
    )
    assert client.get(f"/api/v1/recipes/lists/{obj['id']}").json() == obj


def test_lists_templates_completion_archives_and_progression(client):
    i = ingredient(client)
    r = recipe(client, i)
    obj = post(
        client,
        "lists",
        {"title": "Samedi", "items": [{"ingredient_id": i["id"], "quantity": "5", "unit": "u"}]},
    )
    obj = post(
        client,
        f"lists/{obj['id']}/import",
        {
            "expected_version": obj["version"],
            "recipe_id": r["id"],
            "recipe_version": r["version"],
            "servings": 2,
        },
    )
    assert (
        client.put(
            f"/api/v1/recipes/lists/{obj['id']}/complete",
            json={"completed": True, "expected_version": obj["version"]},
        ).status_code
        == 422
    )
    for line in obj["items"]:
        obj = put(client, f"lists/{obj['id']}/items/{line['id']}/check", obj, checked=True)
    obj = put(client, f"lists/{obj['id']}/complete", obj, completed=True)
    summary = client.get("/api/v1/progression/recipes").json()
    assert summary["xp"] > 0
    obj = put(client, f"lists/{obj['id']}/complete", obj, completed=False)
    obj = put(client, f"lists/{obj['id']}/complete", obj, completed=True)
    assert client.get("/api/v1/progression/recipes").json()["xp"] == summary["xp"]
    template = post(
        client,
        f"lists/{obj['id']}/copy",
        {"title": "Essentiels", "kind": "template", "expected_version": obj["version"]},
    )
    assert all(not row["checked"] for row in template["items"]) and template["completed_at"] is None
    copy = post(
        client,
        f"lists/{template['id']}/copy",
        {"title": "Dimanche", "kind": "list", "expected_version": template["version"]},
    )
    assert all(Decimal(row["purchased_quantity"]) == 0 for row in copy["items"])
    archived = put(client, f"lists/{obj['id']}/archive", obj, archived=True)
    assert client.get("/api/v1/recipes/lists?archived=true").json()["items"][0] == archived
    assert client.get(f"/api/v1/recipes/lists/{obj['id']}/history").json()
    client.put("/api/v1/applications/recipes", json={"enabled": False})
    assert client.get(f"/api/v1/recipes/lists/{obj['id']}").status_code == 403
    client.put("/api/v1/applications/recipes", json={"enabled": True})
    assert client.get(f"/api/v1/recipes/lists/{obj['id']}").json() == archived
    restored = put(client, f"lists/{obj['id']}/archive", archived, archived=False)
    assert restored["completed_at"] == obj["completed_at"]


def test_ownership_csrf_and_cross_owner_ingredient_constraint(client, app, engine):
    i = ingredient(client)
    r = recipe(client, i)
    obj = add(client, shopping(client), i)
    with TestClient(app) as bob:
        auth = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        bob.headers["X-CSRF-Token"] = auth.json()["csrf_token"]
        bob.put("/api/v1/applications/recipes", json={"enabled": True})
        own = ingredient(bob, "Bob secret")
        assert bob.get("/api/v1/recipes/ingredients?q=Riz%20de%20test").json()["total"] == 0
        for path in (
            f"recipes/{r['id']}",
            f"lists/{obj['id']}",
            f"recipes/{r['id']}/history",
            f"lists/{obj['id']}/history",
        ):
            assert bob.get("/api/v1/recipes/" + path).status_code == 404
        assert (
            bob.post(
                "/api/v1/recipes/recipes",
                json={
                    "title": "bad",
                    "servings": 2,
                    "items": [{"ingredient_id": i["id"], "quantity": 1, "unit": "g"}],
                },
            ).status_code
            == 404
        )
    with pytest.raises(IntegrityError), Session(engine) as db, db.begin():
        line = db.scalar(select(RecipeItem).where(RecipeItem.recipe_id == UUID(r["id"])))
        line.ingredient_id = UUID(own["id"])
        db.flush()
    with TestClient(app) as guest:
        guest.cookies.update(dict(client.cookies))
        assert (
            guest.post("/api/v1/recipes/ingredients", json={"name": "Bad", "unit": "g"}).status_code
            == 403
        )
    assert (
        client.post(
            "/api/v1/recipes/lists", json={"title": "Bad", "owner_id": str(uuid4())}
        ).status_code
        == 422
    )


@pytest.mark.parametrize("amount", ["0", "-1", "NaN", "Infinity", "0.0000001", "1000000001", True])
def test_invalid_quantities_rejected(client, amount):
    i = ingredient(client)
    response = client.post(
        "/api/v1/recipes/recipes",
        json={
            "title": "Invalid",
            "servings": 2,
            "items": [{"ingredient_id": i["id"], "quantity": amount, "unit": "g"}],
        },
    )
    assert response.status_code == 422


def test_immutable_events_and_migration_loss_guard(client, engine):
    r = recipe(client, ingredient(client))
    with pytest.raises(DBAPIError), engine.begin() as db:
        db.execute(text("UPDATE recipes_events SET kind='recipe_updated'"))
    with pytest.raises(RuntimeError, match="Recipe data exists"), engine.begin() as conn:
        config = migration_config()
        config.attributes["connection"] = conn
        command.downgrade(config, "0011_okr")
    assert client.get(f"/api/v1/recipes/recipes/{r['id']}").status_code == 200


def test_empty_migration_roundtrip_and_seed(engine):
    # Fixture truncates personal tables; this test receives no business actions.
    with engine.begin() as db:
        tables = [
            "recipes_events",
            "recipes_recipe_items",
            "recipes_list_items",
            "recipes_lists",
            "recipes_recipes",
            "recipes_ingredients",
        ]
        db.execute(text("TRUNCATE " + ",".join(tables) + " CASCADE"))
        config = migration_config()
        config.attributes["connection"] = db
        command.downgrade(config, "0011_okr")
        command.upgrade(config, "head")
        assert db.scalar(select(text("count(*)")).select_from(Ingredient)) == 301


def test_edit_remove_archive_and_atomic_overflow(client):
    i = ingredient(client)
    r = recipe(
        client,
        i,
        items=[
            {"ingredient_id": i["id"], "quantity": "0.1", "unit": "g"},
            {"ingredient_id": i["id"], "quantity": "0.2", "unit": "g"},
        ],
    )
    assert len(r["items"]) == 1 and Decimal(r["items"][0]["quantity"]) == Decimal("0.3")
    r = put(
        client,
        f"recipes/{r['id']}",
        r,
        title="Éditée",
        servings=4,
        instructions="Étape 2",
        items=[{"ingredient_id": i["id"], "quantity": "8", "unit": "u"}],
    )
    assert r["base_servings"] == 4 and r["instructions"] == "Étape 2"
    archived = put(client, f"recipes/{r['id']}/archive", r, archived=True)
    obj = shopping(client)
    payload = {
        "expected_version": obj["version"],
        "recipe_id": r["id"],
        "recipe_version": archived["version"],
        "servings": 4,
    }
    assert client.post(f"/api/v1/recipes/lists/{obj['id']}/import", json=payload).status_code == 409
    r = put(client, f"recipes/{r['id']}/archive", archived, archived=False)
    assert client.post(f"/api/v1/recipes/lists/{obj['id']}/import", json=payload).status_code == 409
    obj = add(client, obj, i, "1000000000")
    before = obj
    assert (
        client.post(
            f"/api/v1/recipes/lists/{obj['id']}/items",
            json={
                "expected_version": obj["version"],
                "ingredient_id": i["id"],
                "quantity": "1",
                "unit": "g",
            },
        ).status_code
        == 422
    )
    assert client.get(f"/api/v1/recipes/lists/{obj['id']}").json() == before
    obj = put(client, f"lists/{obj['id']}", obj, title="Renommée")
    line = obj["items"][0]
    obj = put(client, f"lists/{obj['id']}/items/{line['id']}/check", obj, checked=True)
    obj = put(client, f"lists/{obj['id']}/items/{line['id']}", obj, quantity="12.5")
    assert Decimal(obj["items"][0]["purchased_quantity"]) == Decimal("12.5")
    response = client.request(
        "DELETE",
        f"/api/v1/recipes/lists/{obj['id']}/items/{line['id']}",
        json={"expected_version": obj["version"]},
    )
    assert response.status_code == 200 and response.json()["items"] == []
    template = add(client, shopping(client, kind="template"), i)
    assert (
        client.put(
            f"/api/v1/recipes/lists/{template['id']}/items/{template['items'][0]['id']}/check",
            json={"checked": True, "expected_version": template["version"]},
        ).status_code
        == 422
    )


def test_metrics_first_confirmations_and_progression_replay(client, app):
    from test_integrations import evaluate

    from life_app.apps.recipes.progression import provider
    from life_app.platform.auth.models import User
    from life_app.platform.progression.service import record

    i = ingredient(client)
    r = recipe(client, i)
    obj = shopping(client)
    for _ in range(2):
        obj = post(
            client,
            f"lists/{obj['id']}/import",
            {
                "expected_version": obj["version"],
                "recipe_id": r["id"],
                "recipe_version": r["version"],
                "servings": 2,
            },
        )
    obj = put(client, f"lists/{obj['id']}/items/{obj['items'][0]['id']}/check", obj, checked=True)
    obj = put(client, f"lists/{obj['id']}/complete", obj, completed=True)
    template = post(
        client,
        f"lists/{obj['id']}/copy",
        {"expected_version": obj["version"], "title": "Modèle", "kind": "template"},
    )
    add(client, template, i)
    for metric in ("recipes", "lists", "imports", "templates"):
        assert evaluate(client, metric, application="recipes")["value"] == 1
        assert (
            evaluate(client, metric, application="recipes", since="2001-01-01", until="2001-01-02")[
                "value"
            ]
            == 0
        )
    quests = client.get("/api/v1/progression/recipes/quests").json()
    assert quests["total"] == 60
    previous = client.get("/api/v1/progression/recipes").json()
    owner = UUID(client.get("/api/v1/auth/session").json()["user_id"])
    with app.state.sessions() as db, db.begin():
        user = db.get(User, owner)
        facts = list(provider.history(db, user))
        assert len(facts) == 4
        for fact in facts:
            record(db, user, "recipes", provider, fact)
    assert client.get("/api/v1/progression/recipes").json() == previous
    client.put("/api/v1/applications/recipes", json={"enabled": False})
    assert client.get("/api/v1/progression/recipes").status_code == 403
    query = {
        "application_id": "recipes",
        "metric_id": "recipes",
        "since": "2026-01-01",
        "until": "2026-12-31",
    }
    assert client.post("/api/v1/integrations/evaluate", json=query).status_code == 409


def test_concurrent_additions_and_ingredient_creation(client, app):
    from concurrent.futures import ThreadPoolExecutor

    i = ingredient(client)
    obj = shopping(client)

    def add_once(_):
        with TestClient(app) as other:
            other.cookies.update(client.cookies)
            return other.post(
                f"/api/v1/recipes/lists/{obj['id']}/items",
                headers={"X-CSRF-Token": client.headers["X-CSRF-Token"]},
                json={
                    "expected_version": obj["version"],
                    "ingredient_id": i["id"],
                    "quantity": "2",
                    "unit": "g",
                },
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(add_once, range(2))) == [200, 409]
    assert (
        Decimal(client.get(f"/api/v1/recipes/lists/{obj['id']}").json()["items"][0]["quantity"])
        == 2
    )

    def create_once(_):
        with TestClient(app) as other:
            other.cookies.update(client.cookies)
            return other.post(
                "/api/v1/recipes/ingredients",
                headers={"X-CSRF-Token": client.headers["X-CSRF-Token"]},
                json={"name": "Concurrent", "unit": "u"},
            ).json()["id"]

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert len(set(pool.map(create_once, range(2)))) == 1


@pytest.mark.parametrize("unit", ["ml", "mg", "tsp", "tbsp"])
def test_additional_units_through_recipe_shopping_and_template(client, unit):
    i = ingredient(client, unit=unit)
    assert i["unit"] == unit
    r = recipe(client, i, items=[{"ingredient_id": i["id"], "quantity": "0.5", "unit": unit}])
    scaled = client.get(f"/api/v1/recipes/recipes/{r['id']}?servings=3").json()
    assert scaled["items"][0]["unit"] == unit
    assert Decimal(scaled["items"][0]["quantity"]) == Decimal("0.75")
    obj = add(client, shopping(client), i, "0.25", unit)
    obj = post(
        client,
        f"lists/{obj['id']}/import",
        {
            "expected_version": obj["version"],
            "recipe_id": r["id"],
            "recipe_version": r["version"],
            "servings": 3,
        },
    )
    assert len(obj["items"]) == 1
    assert Decimal(obj["items"][0]["quantity"]) == 1
    line = obj["items"][0]
    obj = put(client, f"lists/{obj['id']}/items/{line['id']}/check", obj, checked=True)
    obj = add(client, obj, i, "0.5", unit)
    assert Decimal(obj["items"][0]["purchased_quantity"]) == 1
    assert Decimal(obj["items"][0]["quantity"]) == Decimal("1.5")
    assert not obj["items"][0]["checked"]
    for other in {"g", "mg", "l", "ml", "tsp", "tbsp", "u"} - {unit}:
        obj = add(client, obj, i, "1", other)
    assert len(obj["items"]) == 7
    template = post(
        client,
        f"lists/{obj['id']}/copy",
        {"title": "Unités", "kind": "template", "expected_version": obj["version"]},
    )
    assert {(x["unit"], x["quantity"]) for x in template["items"]} == {
        (x["unit"], x["quantity"]) for x in obj["items"]
    }
    assert all(Decimal(x["purchased_quantity"]) == 0 for x in template["items"])
    for enabled in [False, True]:
        assert (
            client.put("/api/v1/applications/recipes", json={"enabled": enabled}).status_code == 200
        )
    assert client.get(f"/api/v1/recipes/lists/{obj['id']}").json() == obj
    history = client.get(f"/api/v1/recipes/recipes/{r['id']}/history").json()
    assert history[0]["snapshot"]["items"][0]["unit"] == unit


@pytest.mark.parametrize("unit", ["kg", "cup", "café", "", "ML"])
def test_unknown_recipe_units_rejected(client, unit):
    i = ingredient(client)
    assert (
        client.post(
            "/api/v1/recipes/ingredients", json={"name": "Invalid", "unit": unit}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/recipes/recipes",
            json={
                "title": "Invalid",
                "items": [{"ingredient_id": i["id"], "quantity": "1", "unit": unit}],
            },
        ).status_code
        == 422
    )
    obj = shopping(client)
    assert (
        client.post(
            f"/api/v1/recipes/lists/{obj['id']}/items",
            json={
                "ingredient_id": i["id"],
                "quantity": "1",
                "unit": unit,
                "expected_version": obj["version"],
            },
        ).status_code
        == 422
    )


@pytest.mark.parametrize("location", ["ingredient", "recipe", "list", "history"])
def test_unit_migration_refuses_loss(client, engine, location):
    i = ingredient(client, unit="ml" if location == "ingredient" else "g")
    if location in {"recipe", "history"}:
        r = recipe(client, i, items=[{"ingredient_id": i["id"], "quantity": "1", "unit": "tsp"}])
        if location == "history":
            put(
                client,
                f"recipes/{r['id']}",
                r,
                title=r["title"],
                servings=2,
                items=[{"ingredient_id": i["id"], "quantity": "1", "unit": "g"}],
            )
    if location == "list":
        add(client, shopping(client), i, "1", "tbsp")
    with pytest.raises(RuntimeError, match="New recipe units"), engine.begin() as conn:
        config = migration_config()
        config.attributes["connection"] = conn
        command.downgrade(config, "0012_recipes")
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT version_num FROM alembic_version")) == "0013_recipe_units"


def test_unit_migration_preserves_old_data_and_constraints(client, engine):
    i = ingredient(client)
    r = recipe(client, i)
    obj = add(client, shopping(client), i)
    history = client.get(f"/api/v1/recipes/recipes/{r['id']}/history").json()
    with engine.begin() as conn:
        config = migration_config()
        config.attributes["connection"] = conn
        command.downgrade(config, "0012_recipes")
        command.upgrade(config, "head")
    assert client.get(f"/api/v1/recipes/recipes/{r['id']}").json() == r
    assert client.get(f"/api/v1/recipes/lists/{obj['id']}").json() == obj
    assert client.get(f"/api/v1/recipes/recipes/{r['id']}/history").json() == history
    for table in ["recipes_ingredients", "recipes_recipe_items", "recipes_list_items"]:
        with pytest.raises(IntegrityError), engine.begin() as conn:
            conn.execute(text(f"UPDATE {table} SET unit='cup'"))
    for table in ["recipes_recipe_items", "recipes_list_items"]:
        with pytest.raises(IntegrityError), engine.begin() as conn:
            conn.execute(text(f"UPDATE {table} SET position=-1"))
