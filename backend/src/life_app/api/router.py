"""Versioned API router."""

from fastapi import APIRouter

from life_app.api.health import router as health_router
from life_app.api.v1.auth import router as auth_router
from life_app.api.v1.tasks import router as tasks_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(tasks_router)
