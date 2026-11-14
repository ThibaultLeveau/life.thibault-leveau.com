"""Build small real static trees to exercise FastAPI's production routing."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from life_app.cli import migration_config
from life_app.core.config import Settings
from life_app.core.database import Base
from life_app.main import create_app
from life_app.platform.auth.models import User
from life_app.platform.auth.service import hasher

PASSWORD = "synthetic-test-password"
PASSWORD_HASH = hasher.hash(PASSWORD)


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


@pytest.fixture(scope="module")
def engine():
    url = os.environ.get("LIFE_TEST_DATABASE_URL")
    if not url:
        pytest.fail("Run make test, or supply LIFE_TEST_DATABASE_URL for an isolated test schema")
    schema = "life_test_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    try:
        with engine.begin() as conn:
            config = migration_config()
            config.attributes["connection"] = conn
            command.upgrade(config, "head")
        yield engine
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def app(engine):
    with engine.begin() as conn:
        names = ", ".join(f'"{name}"' for name in Base.metadata.tables)
        conn.execute(text(f"TRUNCATE {names} CASCADE"))
    with Session(engine) as db, db.begin():
        db.add_all([User(username=name, password_hash=PASSWORD_HASH) for name in ("alice", "bob")])
    app = create_app(
        Settings(
            _env_file=None,
            environment="test",
            database_url=None,
            public_base_url="http://testserver",
        )
    )
    app.state.sessions = sessionmaker(engine, expire_on_commit=False)
    return app


@pytest.fixture
def authenticated_client(app):
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/session", json={"username": "alice", "password": PASSWORD}
        )
        assert response.status_code == 200, response.text
        client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        yield client
