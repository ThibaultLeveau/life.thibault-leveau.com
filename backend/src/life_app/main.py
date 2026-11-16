"""ASGI entry point and application factory."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError
from starlette.exceptions import HTTPException

from life_app import __version__
from life_app.api.router import router
from life_app.apps.registry import APPLICATIONS
from life_app.core.config import Settings, get_settings
from life_app.core.database import configure_database
from life_app.core.i18n import negotiate_language, request_context
from life_app.core.logging import configure_logging
from life_app.core.messages import tr
from life_app.core.validation import HTTPErrorOutput, ValidationErrorOutput, validation_detail
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
        description=(
            "API de l’espace personnel Life. La langue du compte (`locale: fr/en`) "
            "localise les réponses. Avant connexion, Accept-Language choisit la langue, "
            "avec repli français. Les identifiants et codes restent stables."
        ),
        version=__version__,
        docs_url="/api/docs",
        swagger_ui_oauth2_redirect_url="/api/docs/oauth2-redirect",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=lifespan,
        responses={
            code: {
                "description": description,
                "model": (HTTPErrorOutput | ValidationErrorOutput)
                if code == 422
                else HTTPErrorOutput,
            }
            for code, description in {
                401: "Session absente, expirée ou invalide",
                403: "Origine/jeton CSRF refusé ou application désactivée",
                404: "Ressource absente ou inaccessible",
                409: "Conflit de données ou de version",
                422: "Entrée invalide",
                429: "Trop de tentatives de connexion",
                503: "Base indisponible ou non configurée",
            }.items()
        },
    )
    application.state.settings = settings
    application.state.applications = APPLICATIONS
    configure_database(application, settings)

    @application.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException):
        detail = error.detail
        if isinstance(detail, str) and detail in {"Not Found", "Method Not Allowed"}:
            detail = tr("not_found" if error.status_code == 404 else "http_error")
        return JSONResponse(
            {"detail": detail, "code": getattr(detail, "code", f"http.{error.status_code}")},
            status_code=error.status_code,
            headers=error.headers,
        )

    @application.exception_handler(IntegrityError)
    async def integrity_error(request: Request, error: IntegrityError):
        detail = tr("data_conflict_check_references_and_duplicates")
        return JSONResponse(
            {"detail": detail, "code": detail.code},
            status_code=409,
        )

    @application.exception_handler(DBAPIError)
    async def unavailable(request: Request, error: DBAPIError):
        detail = tr("the_database_is_temporarily_unavailable")
        return JSONResponse({"detail": detail, "code": detail.code}, status_code=503)

    @application.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, error: RequestValidationError):
        return JSONResponse(
            {"detail": [validation_detail(item) for item in error.errors()]},
            status_code=422,
        )

    @application.middleware("http")
    async def private_responses(request: Request, call_next):
        request.state.locale = negotiate_language(request.headers.get("accept-language", ""))
        token = request_context.set(request)
        try:
            response = await call_next(request)
        finally:
            request_context.reset(token)
        if request.url.path.startswith("/api/v1/") and request.url.path != "/api/v1/health":
            response.headers["Cache-Control"] = "no-store"
            response.headers["Content-Language"] = request.state.locale
            response.headers["Vary"] = "Accept-Language, Cookie"
        return response

    application.include_router(router)
    register_static_routes(application, settings)
    return application
