"""One SQLAlchemy session per HTTP request; migrations remain an explicit command."""

from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    return datetime.now(UTC)


def configure_database(app, settings) -> None:
    app.state.engine = None
    app.state.sessions = None
    if settings.database_url:
        engine = create_engine(
            settings.database_url.get_secret_value(),
            pool_pre_ping=True,
            connect_args={"connect_timeout": 5},
        )
        app.state.engine = engine
        app.state.sessions = sessionmaker(engine, expire_on_commit=False)


def database(request: Request) -> Iterator[Session]:
    if request.app.state.sessions is None:
        raise HTTPException(503, "Base de données non configurée.")
    with request.app.state.sessions() as session:
        yield session


Database = Annotated[Session, Depends(database)]
