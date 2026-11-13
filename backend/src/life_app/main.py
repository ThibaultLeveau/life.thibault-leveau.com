"""ASGI entry point and application factory."""

from fastapi import FastAPI

from life_app import __version__
from life_app.api.router import router
from life_app.core.config import Settings, get_settings
from life_app.core.logging import configure_logging
from life_app.web.static import register_static_routes


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    application = FastAPI(
        title="Life API",
        description="API de l’espace personnel Life.",
        version=__version__,
        docs_url="/api/docs",
        swagger_ui_oauth2_redirect_url="/api/docs/oauth2-redirect",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    application.state.settings = settings
    application.include_router(router)
    register_static_routes(application, settings)
    return application
