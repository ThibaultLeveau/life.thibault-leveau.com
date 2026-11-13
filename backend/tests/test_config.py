from pathlib import Path

import pytest
from pydantic import ValidationError

from life_app.core.config import PROJECT_ROOT, Settings
from life_app.main import create_app


def test_environment_overrides(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("LIFE_ENVIRONMENT", "test")
    monkeypatch.setenv("LIFE_PUBLIC_BASE_URL", "https://life.example.com")
    monkeypatch.setenv("LIFE_LOG_LEVEL", "WARNING")
    monkeypatch.setenv("LIFE_FRONTEND_DIR", str(tmp_path / "frontend"))
    monkeypatch.setenv("LIFE_DOCUMENTATION_DIR", str(tmp_path / "docs"))
    settings = Settings(_env_file=None)
    assert settings.environment == "test"
    assert str(settings.public_base_url) == "https://life.example.com/"
    assert settings.log_level == "WARNING"
    assert settings.frontend_dir == tmp_path / "frontend"
    assert settings.documentation_dir == tmp_path / "docs"


@pytest.mark.parametrize(
    "override",
    [{"environment": "unknown"}, {"log_level": "invalid"}, {"public_base_url": "invalid"}],
)
def test_invalid_configuration_rejected(override: dict) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **override)


def test_production_requires_built_frontend(static_settings: Settings) -> None:
    (static_settings.frontend_dir / "index.html").unlink()
    with pytest.raises(RuntimeError, match="Missing frontend build"):
        create_app(static_settings)


def test_production_requires_built_documentation(static_settings: Settings) -> None:
    (static_settings.documentation_dir / "index.html").unlink()
    with pytest.raises(RuntimeError, match="Missing documentation build"):
        create_app(static_settings)


def test_production_requires_frontend_assets(static_settings: Settings) -> None:
    assets = static_settings.frontend_dir / "assets"
    (assets / "app.js").unlink()
    assets.rmdir()
    with pytest.raises(RuntimeError, match="Missing frontend assets"):
        create_app(static_settings)


def test_relative_static_directories_resolve_from_project_root(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("LIFE_FRONTEND_DIR", "frontend/dist")
    monkeypatch.setenv("LIFE_DOCUMENTATION_DIR", "site")
    settings = Settings(_env_file=None)
    assert settings.frontend_dir == PROJECT_ROOT / "frontend" / "dist"
    assert settings.documentation_dir == PROJECT_ROOT / "site"
