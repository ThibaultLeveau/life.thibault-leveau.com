"""ASGI entry point and application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError

from life_app import __version__
from life_app.api.router import router
from life_app.core.config import Settings, get_settings
from life_app.core.database import configure_database
from life_app.core.logging import configure_logging
from life_app.web.static import register_static_routes


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app):
        yield
        if app.state.engine:
            app.state.engine.dispose()

    application = FastAPI(
        title="Life API",
        description="API de l’espace personnel Life.",
        version=__version__,
        docs_url="/api/docs",
        swagger_ui_oauth2_redirect_url="/api/docs/oauth2-redirect",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
        responses={
            code: {"description": description}
            for code, description in {
                401: "Session absente, expirée ou invalide",
                403: "Origine ou jeton CSRF refusé",
                404: "Ressource absente ou inaccessible",
                409: "Conflit de données ou de version",
                422: "Entrée invalide",
                429: "Trop de tentatives de connexion",
                503: "Base indisponible ou non configurée",
            }.items()
        },
    )
    application.state.settings = settings
    configure_database(application, settings)

    @application.exception_handler(IntegrityError)
    async def integrity_error(request: Request, error: IntegrityError):
        return JSONResponse(
            {"detail": "Conflit de données. Vérifiez les références et les doublons."},
            status_code=409,
        )

    @application.exception_handler(DBAPIError)
    async def unavailable(request: Request, error: DBAPIError):
        return JSONResponse(
            {"detail": "La base de données est temporairement indisponible."}, status_code=503
        )

    @application.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, error: RequestValidationError):
        return JSONResponse(
            {
                "detail": [
                    {key: item[key] for key in ("loc", "msg", "type")} for item in error.errors()
                ]
            },
            status_code=422,
        )

    @application.middleware("http")
    async def private_responses(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/v1/") and request.url.path != "/api/v1/health":
            response.headers["Cache-Control"] = "no-store"
        return response

    application.include_router(router)
    register_static_routes(application, settings)
    return application
