"""Versioned API router."""

from fastapi import APIRouter, Depends

from life_app.api.health import router as health_router
from life_app.apps.registry import APPLICATIONS
from life_app.platform.applications.dependencies import require_application
from life_app.platform.applications.router import router as applications_router
from life_app.platform.auth.router import router as auth_router

router = APIRouter(prefix="/api/v1")
router.include_router(health_router)
router.include_router(auth_router)
router.include_router(applications_router)
for application in APPLICATIONS:
    router.include_router(
        application.router, dependencies=[Depends(require_application(application.id))]
    )
