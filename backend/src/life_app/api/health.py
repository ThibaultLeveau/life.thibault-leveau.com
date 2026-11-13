"""Liveness endpoint, independent of the frontend and documentation."""

from pathlib import Path
from typing import Literal

from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError

from life_app.core.database import Database

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


@router.get("/health", response_model=HealthResponse, summary="État de l’application")
async def health() -> HealthResponse:
    return HealthResponse()


@router.get(
    "/health/ready", response_model=HealthResponse, summary="Base accessible et schéma à jour"
)
def ready(db: Database) -> HealthResponse:
    expected = ScriptDirectory(str(Path(__file__).parents[1] / "migrations")).get_heads()
    try:
        actual = MigrationContext.configure(db.connection()).get_current_heads()
    except SQLAlchemyError:
        raise HTTPException(503, "Base de données indisponible.") from None
    if set(actual) != set(expected):
        raise HTTPException(503, "Migrations de base de données requises.")
    return HealthResponse()
