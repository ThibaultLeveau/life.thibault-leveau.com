"""Build small real static trees to exercise FastAPI's production routing."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from life_app.core.config import Settings
from life_app.main import create_app


@pytest.fixture
def static_settings(tmp_path: Path) -> Settings:
    frontend = tmp_path / "frontend"
    docs = tmp_path / "documentation"
    (frontend / "assets").mkdir(parents=True)
    (docs / "demarrage").mkdir(parents=True)
    (frontend / "index.html").write_text("<h1>Bienvenue, Thibault.</h1>", encoding="utf-8")
    (frontend / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")
    (frontend / "assets" / "app.js").write_text("console.log('Life');", encoding="utf-8")
    (docs / "index.html").write_text("<h1>Documentation Life</h1>", encoding="utf-8")
    (docs / "404.html").write_text("<h1>Page introuvable</h1>", encoding="utf-8")
    (docs / "demarrage" / "index.html").write_text("<h1>Démarrage</h1>", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("must not be public", encoding="utf-8")
    return Settings(
        _env_file=None,
        environment="production",
        frontend_dir=frontend,
        documentation_dir=docs,
    )


@pytest.fixture
def client(static_settings: Settings):
    with TestClient(create_app(static_settings)) as test_client:
        yield test_client
