"""Keep application boundaries and registration contracts enforceable as LifeOS grows."""

import ast
import re
from pathlib import Path

from http_contracts import application_operations

from life_app.apps.registry import APPLICATIONS

ROOT = Path(__file__).parents[2]
BACKEND = ROOT / "backend/src/life_app"
FRONTEND = ROOT / "frontend/src"


def test_applications_have_matching_manifests_and_standard_structure():
    ids = {item.id for item in APPLICATIONS}
    assert len(ids) == len(APPLICATIONS)
    assert len({item.path for item in APPLICATIONS}) == len(ids)
    # ADR 003: only the migrated Tasks application is enabled without user consent.
    assert {item.id for item in APPLICATIONS if item.default_enabled} == {"tasks"}
    assert all(re.fullmatch(r"/[a-z][a-z0-9_-]*", item.path) for item in APPLICATIONS)
    assert not {item.path for item in APPLICATIONS} & {
        "/applications",
        "/settings",
        "/documentation",
        "/api",
        "/assets",
    }
    assert all(re.fullmatch(r"[a-z][a-z0-9_]{0,49}", item.id) for item in APPLICATIONS)
    operations = set()
    for item in APPLICATIONS:
        assert item.name and item.description
        assert set(item.translations) == {"en"}
        assert all(item.translations["en"])
        for base in (BACKEND, FRONTEND):
            for language in ("fr", "en"):
                assert (base / "apps" / item.id / "locales" / f"{language}.json").is_file()
        for method, path in application_operations(item):
            operation = (method, path)
            assert operation not in operations, "Collision entre routes métier"
            assert not path.startswith(
                ("/auth/", "/preferences", "/applications", "/health", "/progression")
            )
            operations.add(operation)
    for base in (BACKEND, FRONTEND):
        assert {
            p.name for p in (base / "apps").iterdir() if p.is_dir() and p.name != "__pycache__"
        } == ids
    for app_id in ids:
        for name in ("manifest.py", "router.py", "models.py", "schemas.py", "service.py"):
            assert (BACKEND / "apps" / app_id / name).is_file()
        for name in ("manifest.ts", "Page.tsx", "api.ts", "types.ts", "styles.css", "components"):
            assert (FRONTEND / "apps" / app_id / name).exists()
        manifest = (FRONTEND / "apps" / app_id / "manifest.ts").read_text()
        assert re.search(r'id:\s*[\'"]' + app_id + r'[\'"]', manifest)
        assert f"./{app_id}/manifest" in (FRONTEND / "apps/registry.ts").read_text()


def test_backend_platform_and_applications_do_not_import_other_business_domains():
    for directory in ("platform", "core", "apps"):
        for path in (BACKEND / directory).rglob("*.py"):
            if path.name == "registry.py":
                continue
            owner = path.relative_to(BACKEND).parts
            for node in ast.walk(ast.parse(path.read_text())):
                modules = (
                    [node.module or ""]
                    if isinstance(node, ast.ImportFrom)
                    else [item.name for item in node.names]
                    if isinstance(node, ast.Import)
                    else []
                )
                for module in modules:
                    if module.startswith("life_app.apps."):
                        assert owner[0] == "apps" and module.split(".")[2] == owner[1], path


def test_frontend_platform_shared_and_apps_respect_dependency_boundaries():
    for directory in ("platform", "shared", "apps"):
        for path in (FRONTEND / directory).rglob("*"):
            if path.suffix not in {".ts", ".tsx"} or path.name == "registry.ts":
                continue
            owner = path.relative_to(FRONTEND).parts
            for specifier in re.findall(r'(?:from\s+|import\s*\()[\'"]([^\'"]+)', path.read_text()):
                if not specifier.startswith("."):
                    continue
                target = (path.parent / specifier).resolve().relative_to(FRONTEND.resolve()).parts
                if target[0] == "apps":
                    assert owner[0] == "apps" and target[1] == owner[1], (path, specifier)
                if owner[0] == "shared":
                    assert target[0] == "shared", (path, specifier)


def test_metric_providers_are_owned_by_their_application_and_frames_are_shared():
    providers = [app for app in APPLICATIONS if app.metrics is not None]
    assert {app.id for app in providers} == {"tasks", "sport", "okr", "recipes"}
    for app in providers:
        assert type(app.metrics).__module__ == f"life_app.apps.{app.id}.integrations"
        metrics = app.metrics.catalogue()
        assert metrics and len({metric.id for metric in metrics}) == len(metrics)
        assert all(
            metric.aggregations and metric.label and metric.description for metric in metrics
        )
        for metric in metrics:
            assert len({f.id for f in metric.filters}) == len(metric.filters)
    for app_id in (app.id for app in APPLICATIONS):
        assert (
            "shared/ui/ApplicationNavigation"
            in (FRONTEND / "apps" / app_id / "Page.tsx").read_text()
        )


def test_progression_providers_keep_catalogues_in_their_application():
    for app in APPLICATIONS:
        if app.id == "life_ai":
            assert app.progression is None  # ADR 011: conversation is not a scored habit.
            continue
        assert app.progression is not None
        assert type(app.progression).__module__ == f"life_app.apps.{app.id}.progression"
        assert len(app.progression.quests) >= 50
        assert len({q.id for q in app.progression.quests}) == len(app.progression.quests)
        assert len(app.progression.titles) == 10
        assert all(len(t) == 2 and all(t) for t in app.progression.titles)
        assert all(len(q.names) == 2 and len(q.descriptions) == 2 for q in app.progression.quests)
        assert "ProgressionBadge" in (FRONTEND / "apps" / app.id / "Page.tsx").read_text()


def test_assistant_capabilities_cover_application_routes_with_owned_handlers():
    for app in APPLICATIONS:
        if app.id == "life_ai":
            assert app.actions is None  # Direct-user controls must not recursively call the model.
            continue
        assert app.actions is not None
        actions = app.actions.actions
        assert actions and len({action.name for action in actions}) == len(actions)
        # ADR 010: live human browser control and model-backed preparation are
        # technical, direct-user operations. They must never be autonomous tools.
        human_browser_routes = (
            {
                ("POST", "/recipes/web-import/sessions"),
                ("GET", "/recipes/web-import/sessions/{id}/frame"),
                ("POST", "/recipes/web-import/sessions/{id}/input"),
                ("DELETE", "/recipes/web-import/sessions/{id}"),
                ("POST", "/recipes/web-import/prepare"),
            }
            if app.id == "recipes"
            else set()
        )
        action_routes = {(action.method, action.path) for action in actions}
        assert not action_routes & human_browser_routes
        assert action_routes | human_browser_routes == {
            (method, route.path) for route in app.router.routes for method in route.methods
        }
        for action in actions:
            assert action.labels and len(action.labels) == 2 and all(action.labels)
            assert action.handler.__module__ == f"life_app.apps.{app.id}.assistant"
            assert action.input_model.model_json_schema()["additionalProperties"] is False
            assert action.output_model is not None or any(
                route.path == action.path and route.status_code == 204
                for route in app.router.routes
            )
            assert action.method != "DELETE" or action.confirmation
            assert action.mutating or not action.confirmation
        manifest = (FRONTEND / "apps" / app.id / "manifest.ts").read_text()
        assert "AssistantSnippet" in manifest
        assert 'import("./assistant/Snippet")' in manifest
