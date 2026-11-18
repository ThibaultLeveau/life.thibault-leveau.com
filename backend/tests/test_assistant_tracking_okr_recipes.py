"""Real database parity and transaction boundaries for three app-owned tool providers."""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from pydantic import SecretStr, TypeAdapter, ValidationError
from sqlalchemy import select
from test_assistant import admitted

from life_app.apps.okr import schemas as okr_schemas
from life_app.apps.registry import APPLICATIONS
from life_app.apps.tracking import schemas as tracking_schemas
from life_app.core.database import utcnow
from life_app.platform.assistant import execution
from life_app.platform.assistant.definition import ActionContext
from life_app.platform.auth.models import User

DOMAINS = ("tracking", "okr", "recipes")


def definition(domain):
    return next(app for app in APPLICATIONS if app.id == domain)


def capability(domain, name):
    return next(action for action in definition(domain).actions.actions if action.name == name)


@pytest.fixture
def client(authenticated_client):
    for domain in DOMAINS:
        response = authenticated_client.put(
            f"/api/v1/applications/{domain}", json={"enabled": True}
        )
        assert response.status_code == 200, response.text
    return authenticated_client


@pytest.fixture
def invoke(app):
    called = {domain: set() for domain in DOMAINS}

    def run(domain, name, args=None, *, username="alice", rollback=False):
        action = capability(domain, name)
        payload = action.input_model.model_validate(args or {})
        with app.state.sessions() as db:
            query = select(User).where(User.username == username)
            user = db.scalar(query.with_for_update() if action.mutating else query)
            result = action.handler(ActionContext(db, user, APPLICATIONS), payload)
            adapter = TypeAdapter(action.output_model)
            value = adapter.dump_python(adapter.validate_python(result), mode="json")
            if action.mutating and not rollback:
                db.commit()
        called[domain].add(name)
        return value

    run.called = called
    return run


def get(client, path):
    response = client.get("/api/v1" + path)
    assert response.status_code == 200, response.text
    return response.json()


def today():
    return utcnow().astimezone(ZoneInfo("Europe/Paris")).date().isoformat()


def tracker_payload(**changes):
    return {
        "name": "Reading rhythm",
        "start_date": today(),
        "fields": [{"id": "read", "label": "Read", "kind": "boolean"}],
        **changes,
    }


def assert_all_called(invoke, domain):
    assert invoke.called[domain] == {action.name for action in definition(domain).actions.actions}


@pytest.mark.parametrize("domain,count", [("tracking", 16), ("okr", 11), ("recipes", 22)])
def test_every_http_operation_has_one_owned_typed_capability(domain, count):
    app = definition(domain)
    actions = app.actions.actions
    routes = {
        (method, route.path): route
        for route in app.router.routes
        for method in route.methods
        if "/web-import/" not in route.path or route.path.endswith("/save")
    }
    assert len(actions) == count == len(routes)
    assert len({action.name for action in actions}) == count
    assert {(a.method, a.path) for a in actions} == routes.keys()
    for action in actions:
        assert action.handler.__module__ == f"life_app.apps.{domain}.assistant"
        assert action.input_model.model_json_schema()["additionalProperties"] is False
        assert action.output_model == routes[action.method, action.path].response_model
        assert action.labels and len(action.labels) == 2
        assert all(label and len(label) <= 80 for label in action.labels)
        assert action.mutating == (
            action.method not in {"GET", "HEAD", "OPTIONS"} and not action.path.endswith("/preview")
        )
        if action.path.endswith("/archive") or action.method == "DELETE":
            assert action.confirmation
    if domain == "tracking":
        assert capability(domain, "order_trackers").confirmation
    if domain == "recipes":
        assert capability(domain, "import_recipe").confirmation
        assert capability(domain, "save_web_import").confirmation


def test_tracking_tools_match_http_and_preserve_snapshots(client, invoke):
    created = invoke("tracking", "create_tracker", {"payload": tracker_payload()})
    id = created["id"]
    assert invoke("tracking", "get_tracker", {"id": id}) == get(client, f"/tracking/trackers/{id}")
    payload = {key: created[key] for key in tracking_schemas.TrackerInput.model_fields}
    payload.update(name="Reading every day", expected_version=created["version"])
    updated = invoke("tracking", "update_tracker", {"id": id, "payload": payload})
    assert updated == get(client, f"/tracking/trackers/{id}")
    second = invoke("tracking", "create_tracker", {"payload": tracker_payload(name="Second habit")})
    ordered = invoke("tracking", "order_trackers", {"payload": {"ids": [second["id"], id]}})
    assert [item["id"] for item in ordered] == [second["id"], id]
    assert ordered == invoke("tracking", "list_trackers") == get(client, "/tracking/trackers")
    invoke("tracking", "save_settings", {"payload": {"timezone": "UTC"}})
    assert invoke("tracking", "get_settings") == get(client, "/tracking/settings")
    occurrence = invoke("tracking", "get_entry", {"id": id, "day": today()})
    assert occurrence["entry"] is None
    assert invoke("tracking", "preview_entry", {"id": id, "day": today()}) == occurrence
    entry = invoke(
        "tracking",
        "write_entry",
        {"id": id, "day": today(), "payload": {"values": {"read": False}, "complete": True}},
    )
    assert entry["values"] == {"read": False}
    assert get(client, f"/tracking/trackers/{id}/entries/{today()}")["entry"] == entry
    assert invoke("tracking", "current", {"day": today()}) == get(
        client, f"/tracking/current?day={today()}"
    )
    for action in ("calendar", "statistics"):
        result = invoke("tracking", action, {"since": today(), "until": today(), "tracker_id": id})
        assert result == get(
            client, f"/tracking/{action}?since={today()}&until={today()}&tracker_id={id}"
        )
    assert invoke("tracking", "achievements") == get(client, "/tracking/achievements")
    history = invoke("tracking", "entry_history", {"id": id, "day": today()})
    assert history == get(client, f"/tracking/trackers/{id}/entries/{today()}/history")
    assert history[0]["snapshot"] == entry
    archived = invoke(
        "tracking",
        "archive_tracker",
        {"id": id, "payload": {"expected_version": updated["version"], "archived": True}},
    )
    assert archived["archived_at"]
    restored = invoke(
        "tracking",
        "archive_tracker",
        {"id": id, "payload": {"expected_version": archived["version"], "archived": False}},
    )
    assert restored["archived_at"] is None
    assert get(client, f"/tracking/trackers/{id}/entries/{today()}/history") == history
    assert_all_called(invoke, "tracking")


def test_okr_tools_match_http_and_keep_achievement_history(client, invoke):
    created = invoke(
        "okr",
        "create_objective",
        {"payload": {"title": "Read ten books", "key_results": [{"title": "Books", "target": 10}]}},
    )
    id = created["id"]
    assert invoke("okr", "get_objective", {"id": id}) == get(client, f"/okr/objectives/{id}")
    payload = {key: created[key] for key in okr_schemas.ObjectiveInput.model_fields}
    payload.update(title="Read thoughtfully", expected_version=created["version"])
    objective = invoke("okr", "update_objective", {"id": id, "payload": payload})
    objective = invoke(
        "okr",
        "check_in",
        {
            "id": id,
            "key_result_id": objective["key_results"][0]["id"],
            "payload": {"expected_version": objective["version"], "value": 10, "note": "Finished"},
        },
    )
    assert objective["progress"] == 100
    objective = invoke(
        "okr",
        "move_objective",
        {"id": id, "payload": {"expected_version": objective["version"], "status": "done"}},
    )
    assert objective == get(client, f"/okr/objectives/{id}")
    assert invoke("okr", "list_objectives") == get(client, "/okr/objectives")
    achievements = invoke("okr", "achievements")
    assert achievements == get(client, "/okr/achievements")
    assert achievements["total"] == 1
    history = invoke("okr", "objective_history", {"id": id})
    assert history == get(client, f"/okr/objectives/{id}/history")
    assert {item["kind"] for item in history} >= {"created", "updated", "check_in", "completed"}
    objective = invoke(
        "okr",
        "archive_objective",
        {"id": id, "payload": {"expected_version": objective["version"], "archived": True}},
    )
    assert objective["archived_at"]
    assert (
        invoke("okr", "achievements")["items"][0]["snapshot"]
        == achievements["items"][0]["snapshot"]
    )
    assert invoke("okr", "get_settings") == get(client, "/okr/settings")
    settings = invoke(
        "okr", "save_settings", {"payload": {"timezone": "UTC", "expected_version": 0}}
    )
    assert settings == get(client, "/okr/settings")
    assert_all_called(invoke, "okr")


def test_recipe_tools_match_http_scale_and_preserve_checks(client, invoke):
    ingredient = invoke(
        "recipes",
        "create_ingredient",
        {"payload": {"name": "Rice for assistant tests", "unit": "g"}},
    )
    assert invoke("recipes", "list_ingredients", {"q": "assistant tests"}) == get(
        client, "/recipes/ingredients?q=assistant%20tests"
    )
    recipe_payload = {
        "title": "Rice for two",
        "sections": [{"title": "Cook", "text": "Boil gently."}],
        "servings": 2,
        "items": [{"ingredient_id": ingredient["id"], "quantity": "100.25", "unit": "g"}],
    }
    recipe = invoke("recipes", "create_recipe", {"payload": recipe_payload})
    recipe = invoke(
        "recipes",
        "update_recipe",
        {
            "id": recipe["id"],
            "payload": {
                **{key: value for key, value in recipe_payload.items() if key != "sections"},
                "expected_version": recipe["version"],
            },
        },
    )
    scaled = invoke("recipes", "get_recipe", {"id": recipe["id"], "servings": 3})
    assert scaled == get(client, f"/recipes/recipes/{recipe['id']}?servings=3")
    assert scaled["sections"] == recipe_payload["sections"]
    assert Decimal(scaled["items"][0]["quantity"]) == Decimal("150.375")
    assert invoke("recipes", "list_recipes") == get(client, "/recipes/recipes")
    shopping = invoke("recipes", "create_list", {"payload": {"title": "Saturday"}})
    id = shopping["id"]
    shopping = invoke(
        "recipes",
        "update_list",
        {"id": id, "payload": {"expected_version": shopping["version"], "title": "Sunday"}},
    )
    shopping = invoke(
        "recipes",
        "add_item",
        {
            "id": id,
            "payload": {
                "expected_version": shopping["version"],
                "ingredient_id": ingredient["id"],
                "quantity": "20",
                "unit": "g",
            },
        },
    )
    shopping = invoke(
        "recipes",
        "import_recipe",
        {
            "id": id,
            "payload": {
                "expected_version": shopping["version"],
                "recipe_id": recipe["id"],
                "recipe_version": recipe["version"],
                "servings": 3,
            },
        },
    )
    assert Decimal(shopping["items"][0]["quantity"]) == Decimal("170.375")
    item_id = shopping["items"][0]["id"]
    shopping = invoke(
        "recipes",
        "edit_item",
        {
            "id": id,
            "item_id": item_id,
            "payload": {"expected_version": shopping["version"], "quantity": "180"},
        },
    )
    shopping = invoke(
        "recipes",
        "check_item",
        {
            "id": id,
            "item_id": item_id,
            "payload": {"expected_version": shopping["version"], "checked": True},
        },
    )
    assert shopping["items"][0]["checked"]
    shopping = invoke(
        "recipes",
        "complete_list",
        {"id": id, "payload": {"expected_version": shopping["version"], "completed": True}},
    )
    assert (
        invoke("recipes", "get_list", {"id": id}) == shopping == get(client, f"/recipes/lists/{id}")
    )
    assert invoke("recipes", "list_lists") == get(client, "/recipes/lists")
    copied = invoke(
        "recipes",
        "copy_list",
        {"id": id, "payload": {"expected_version": shopping["version"], "title": "Next weekend"}},
    )
    assert copied["completed_at"] is None and not copied["items"][0]["checked"]
    empty = invoke(
        "recipes",
        "remove_item",
        {
            "id": copied["id"],
            "item_id": copied["items"][0]["id"],
            "payload": {"expected_version": copied["version"]},
        },
    )
    assert empty["items"] == []
    for action, obj, path in (
        ("archive_recipe", recipe, "recipes"),
        ("archive_list", shopping, "lists"),
    ):
        archived = invoke(
            "recipes",
            action,
            {"id": obj["id"], "payload": {"expected_version": obj["version"], "archived": True}},
        )
        assert archived["archived_at"]
        restored = invoke(
            "recipes",
            action,
            {
                "id": obj["id"],
                "payload": {"expected_version": archived["version"], "archived": False},
            },
        )
        assert restored["items"] == obj["items"]
        assert restored == get(client, f"/recipes/{path}/{obj['id']}")
    assert invoke("recipes", "recipe_history", {"id": recipe["id"]}) == get(
        client, f"/recipes/recipes/{recipe['id']}/history"
    )
    history = invoke("recipes", "list_history", {"id": id})
    assert history == get(client, f"/recipes/lists/{id}/history")
    assert {event["kind"] for event in history} >= {
        "recipe_imported",
        "checked",
        "completed",
        "restored",
    }
    imported = invoke(
        "recipes",
        "save_web_import",
        {
            "payload": {
                "import_id": str(uuid4()),
                "locale": "fr",
                "title": "Imported rice",
                "servings": 2,
                "instructions": "Boil rice.",
                "sections": [{"title": "Serve", "text": "Serve warm."}],
                "items": [
                    {
                        "name": ingredient["name"],
                        "ingredient_id": ingredient["id"],
                        "quantity": "200",
                        "unit": "g",
                    }
                ],
                "source_url": "https://example.com/rice",
                "source_title": "Rice source",
            }
        },
    )
    assert imported == get(client, f"/recipes/recipes/{imported['id']}")
    assert imported["source_url"] == "https://example.com/rice"
    assert_all_called(invoke, "recipes")


@pytest.mark.parametrize(
    "domain,create,read,payload",
    [
        ("tracking", "create_tracker", "get_tracker", None),
        ("okr", "create_objective", "get_objective", {"title": "Private future"}),
        ("recipes", "create_list", "get_list", {"title": "Private shopping"}),
    ],
)
def test_adapters_enforce_owner_and_leave_commit_to_dispatcher(
    invoke, domain, create, read, payload
):
    args = {"payload": payload or tracker_payload()}
    private = invoke(domain, create, args, username="bob")
    with pytest.raises(HTTPException) as error:
        invoke(domain, read, {"id": private["id"]})
    assert error.value.status_code == 404
    discarded = invoke(domain, create, args, rollback=True)
    with pytest.raises(HTTPException) as error:
        invoke(domain, read, {"id": discarded["id"]})
    assert error.value.status_code == 404


def test_versions_and_invalid_references_are_enforced(invoke):
    tracker = invoke("tracking", "create_tracker", {"payload": tracker_payload()})
    with pytest.raises(HTTPException) as error:
        invoke("tracking", "order_trackers", {"payload": {"ids": [tracker["id"], str(uuid4())]}})
    assert error.value.status_code == 422
    with pytest.raises(HTTPException) as error:
        invoke(
            "tracking",
            "archive_tracker",
            {"id": tracker["id"], "payload": {"expected_version": 2, "archived": True}},
        )
    assert error.value.status_code == 409
    objective = invoke("okr", "create_objective", {"payload": {"title": "A future"}})
    with pytest.raises(HTTPException) as error:
        invoke(
            "okr",
            "move_objective",
            {"id": objective["id"], "payload": {"expected_version": 2, "status": "done"}},
        )
    assert error.value.status_code == 409
    shopping = invoke("recipes", "create_list", {"payload": {"title": "Shop"}})
    with pytest.raises(HTTPException) as error:
        invoke(
            "recipes",
            "update_list",
            {"id": shopping["id"], "payload": {"expected_version": 2, "title": "Conflict"}},
        )
    assert error.value.status_code == 409
    foreign_ingredient = invoke(
        "recipes",
        "create_ingredient",
        {"payload": {"name": "Secret ingredient", "unit": "u"}},
        username="bob",
    )
    with pytest.raises(HTTPException) as error:
        invoke(
            "recipes",
            "add_item",
            {
                "id": shopping["id"],
                "payload": {
                    "expected_version": 1,
                    "ingredient_id": foreign_ingredient["id"],
                    "quantity": 1,
                    "unit": "u",
                },
            },
        )
    assert error.value.status_code == 404
    assert invoke("recipes", "get_list", {"id": shopping["id"]})["items"] == []


@pytest.mark.parametrize(
    "domain,name,args",
    [
        ("tracking", "entry_history", {"id": str(uuid4()), "day": "2026-11-17", "limit": 101}),
        ("okr", "objective_history", {"id": str(uuid4()), "offset": -1}),
        ("okr", "achievements", {"quarter": "2026-Q5"}),
        ("recipes", "list_ingredients", {"q": "x" * 121}),
        ("recipes", "list_recipes", {"limit": 101}),
        ("recipes", "get_recipe", {"id": str(uuid4()), "servings": 0}),
        ("recipes", "create_list", {"payload": {"title": "Test", "owner_id": str(uuid4())}}),
        ("tracking", "get_settings", {"sql": "SELECT 1"}),
    ],
)
def test_tool_inputs_preserve_http_bounds_and_reject_unknown_fields(domain, name, args):
    with pytest.raises(ValidationError):
        capability(domain, name).input_model.model_validate(args)


def test_tracking_preview_does_not_create_entries_and_calendar_is_bounded(invoke):
    tracker = invoke("tracking", "create_tracker", {"payload": tracker_payload()})
    invoke("tracking", "preview_entry", {"id": tracker["id"], "day": today()})
    assert invoke("tracking", "entry_history", {"id": tracker["id"], "day": today()}) == []
    with pytest.raises(HTTPException) as error:
        invoke(
            "tracking",
            "calendar",
            {
                "since": today(),
                "until": (utcnow().date() + timedelta(days=1000)).isoformat(),
            },
        )
    assert error.value.status_code == 422


def test_unversioned_tracking_preconditions_detect_concurrent_changes(app, invoke):
    first = invoke("tracking", "create_tracker", {"payload": tracker_payload()})
    second = invoke("tracking", "create_tracker", {"payload": tracker_payload(name="Second")})
    action = capability("tracking", "order_trackers")
    payload = action.input_model.model_validate({"payload": {"ids": [first["id"], second["id"]]}})
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        before = action.precondition(ActionContext(db, user, APPLICATIONS), payload)
    invoke("tracking", "order_trackers", {"payload": {"ids": [second["id"], first["id"]]}})
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        assert action.precondition(ActionContext(db, user, APPLICATIONS), payload) != before

    action = capability("tracking", "save_settings")
    payload = action.input_model.model_validate({"payload": {"timezone": "UTC"}})
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        before = action.precondition(ActionContext(db, user, APPLICATIONS), payload)
    invoke("tracking", "save_settings", {"payload": {"timezone": "America/New_York"}})
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice"))
        assert action.precondition(ActionContext(db, user, APPLICATIONS), payload) != before


def test_removal_preview_names_the_removed_item_and_preserves_target_after_confirmation(
    app, client, invoke
):
    app.state.settings.assistant_encryption_keys = SecretStr(Fernet.generate_key().decode())
    configured = client.put(
        "/api/v1/assistant/settings",
        json={"provider": "openai", "model": "synthetic-model", "api_token": "synthetic-token"},
    )
    assert configured.status_code == 200
    ingredient = invoke(
        "recipes", "create_ingredient", {"payload": {"name": "Rice for preview", "unit": "g"}}
    )
    shopping = invoke(
        "recipes",
        "create_list",
        {
            "payload": {
                "title": "Saturday shopping",
                "items": [{"ingredient_id": ingredient["id"], "quantity": "100", "unit": "g"}],
            }
        },
    )
    run_id, conversation_id = admitted(app, client)
    preview = execution.execute(
        app,
        run_id,
        1,
        "recipes",
        "remove_item",
        {
            "id": shopping["id"],
            "item_id": shopping["items"][0]["id"],
            "payload": {"expected_version": shopping["version"]},
        },
    )
    targets = ["Rice for preview — Saturday shopping"]
    assert preview["status"] == "preview"
    assert preview["snippet"]["data"]["targets"] == targets
    assert preview["result"]["items"] == []
    assert len(get(client, f"/recipes/lists/{shopping['id']}")["items"]) == 1
    confirmed = client.post(f"/api/v1/assistant/operations/{preview['operation_id']}/confirm")
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["snippet"]["data"]["targets"] == targets
    details = get(client, f"/assistant/conversations/{conversation_id}")
    assert details["messages"][-1]["snippets"][0]["data"]["targets"] == targets


def test_long_recipe_receipts_preserve_every_instruction_item_and_decimal(app, client):
    app.state.settings.assistant_encryption_keys = SecretStr(Fernet.generate_key().decode())
    configured = client.put(
        "/api/v1/assistant/settings",
        json={"provider": "openai", "model": "synthetic-model", "api_token": "synthetic-token"},
    )
    assert configured.status_code == 200
    run_id, conversation_id = admitted(app, client)
    ingredients = get(client, "/recipes/ingredients?limit=14")["items"]
    instructions = "Une étape détaillée à conserver.\n" * 100 + "Dernière étape complète."
    payload = {
        "title": "Recette longue",
        "servings": 2,
        "instructions": instructions,
        "items": [
            {"ingredient_id": item["id"], "quantity": "1.250001", "unit": item["unit"]}
            for item in ingredients
        ],
    }
    preview = execution.execute(
        app, run_id, 1, "recipes", "create_recipe", {"payload": payload}, propose=True
    )
    assert get(client, "/recipes/recipes")["total"] == 0
    assert preview["snippet"]["data"]["entity"]["instructions"] == instructions
    assert len(preview["snippet"]["data"]["entity"]["items"]) == 14
    response = client.post(f"/api/v1/assistant/operations/{preview['operation_id']}/confirm")
    assert response.status_code == 200, response.text
    saved = response.json()["result"]
    read = execution.execute(app, run_id, 2, "recipes", "get_recipe", {"id": saved["id"]})
    assert read["snippet"]["data"]["entity"] == get(client, f"/recipes/recipes/{saved['id']}")
    for card in get(client, f"/assistant/conversations/{conversation_id}")["messages"][-1][
        "snippets"
    ]:
        assert card["data"]["entity"]["instructions"] == instructions
        assert len(card["data"]["entity"]["items"]) == 14
        assert all(
            Decimal(item["quantity"]) == Decimal("1.250001")
            for item in card["data"]["entity"]["items"]
        )


def test_assistant_free_shopping_items_match_http(client, invoke):
    shopping = invoke(
        "recipes",
        "create_list",
        {
            "payload": {"title": "Maison", "items": [{"name": "Piles", "quantity": "4"}]},
        },
    )
    shopping = invoke(
        "recipes",
        "add_item",
        {
            "id": shopping["id"],
            "payload": {"name": "Lessive", "expected_version": shopping["version"]},
        },
    )
    assert shopping == get(client, f"/recipes/lists/{shopping['id']}")
    assert [item["name"] for item in shopping["items"]] == ["Piles", "Lessive"]
    assert all(item["ingredient_id"] is None for item in shopping["items"])
    copied = invoke(
        "recipes",
        "copy_list",
        {
            "id": shopping["id"],
            "payload": {
                "title": "Maison modèle",
                "kind": "template",
                "expected_version": shopping["version"],
            },
        },
    )
    assert copied == get(client, f"/recipes/lists/{copied['id']}")
    assert get(client, "/recipes/ingredients")["total"] == 301
