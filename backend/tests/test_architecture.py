"""Keep application boundaries and registration contracts enforceable as LifeOS grows."""

import ast
import re
from pathlib import Path

from life_app.apps.registry import APPLICATIONS

ROOT = Path(__file__).parents[2]
BACKEND = ROOT / "backend/src/life_app"
FRONTEND = ROOT / "frontend/src"


def test_applications_have_matching_manifests_and_standard_structure():
    ids = {item.id for item in APPLICATIONS}
    assert len(ids) == len(APPLICATIONS)
    assert len({item.path for item in APPLICATIONS}) == len(ids)
    assert all(re.fullmatch(r"/[a-z][a-z0-9_-]*", item.path) for item in APPLICATIONS)
    assert not {item.path for item in APPLICATIONS} & {"/applications", "/documentation", "/api"}
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
