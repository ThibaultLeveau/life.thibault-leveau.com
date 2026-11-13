from pathlib import Path

from fastapi.testclient import TestClient

from life_app.core.config import Settings
from life_app.main import create_app


def test_health(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_available_without_static_builds(tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        environment="development",
        frontend_dir=tmp_path / "missing-frontend",
        documentation_dir=tmp_path / "missing-documentation",
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/health").json() == {"status": "ok"}
        assert client.get("/").status_code == 503
        assert client.get("/documentation/").status_code == 404
