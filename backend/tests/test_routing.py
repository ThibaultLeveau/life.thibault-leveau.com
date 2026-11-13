import pytest
from fastapi.testclient import TestClient


def test_frontend_and_assets(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "Bienvenue, Thibault." in response.text
    assert response.headers["cache-control"] == "no-cache"
    assert "text/html" in response.headers["content-type"]
    assert client.get("/assets/app.js").text == "console.log('Life');"
    assert client.get("/favicon.svg").headers["content-type"] == "image/svg+xml"


def test_documentation_nested_pages_and_redirect(client: TestClient) -> None:
    assert "Documentation Life" in client.get("/documentation/").text
    assert "Démarrage" in client.get("/documentation/demarrage/").text
    redirect = client.get("/documentation", follow_redirects=False)
    assert redirect.status_code == 307
    assert redirect.headers["location"].endswith("/documentation/")


def test_documentation_404_page_preserves_status(client: TestClient) -> None:
    response = client.get("/documentation/does-not-exist/")
    assert response.status_code == 404
    assert "Page introuvable" in response.text


@pytest.mark.parametrize(
    "path",
    [
        "/unknown",
        "/api/v1/unknown",
        "/api/unknown",
        "/assets/missing.js",
        "/assets/%2e%2e/%2e%2e/secret.txt",
        "/documentation/%2e%2e/secret.txt",
        "/docs",
        "/docs/oauth2-redirect",
        "/openapi.json",
    ],
)
def test_unknown_routes_never_fall_back_to_home(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 404
    assert "Bienvenue" not in response.text
    assert "must not be public" not in response.text


def test_public_api_documentation(client: TestClient) -> None:
    assert client.get("/api/docs").status_code == 200
    schema = client.get("/api/openapi.json").json()
    assert schema["info"]["title"] == "Life API"
    assert {"/api/v1/health", "/api/v1/tasks", "/api/v1/auth/session"} <= set(schema["paths"])
    assert schema["paths"]["/api/v1/health"]["get"]["responses"]["200"]
    assert schema["paths"]["/api/v1/tasks"]["get"]["security"]
    assert schema["components"]["securitySchemes"]["APIKeyCookie"]["in"] == "cookie"


@pytest.mark.parametrize("path", ["/", "/favicon.svg"])
def test_static_head_returns_headers_without_body(client: TestClient, path: str) -> None:
    response = client.head(path)
    assert response.status_code == 200
    assert response.content == b""
    assert int(response.headers["content-length"]) > 0
    assert response.headers["content-type"] == client.get(path).headers["content-type"]
