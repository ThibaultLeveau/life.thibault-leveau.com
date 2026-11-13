"""Liveness endpoint, independent of the frontend and documentation."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


@router.get("/health", response_model=HealthResponse, summary="État de l’application")
async def health() -> HealthResponse:
    return HealthResponse()
