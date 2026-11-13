"""Expose explicitly supported frontend paths without a SPA catch-all."""

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from life_app.core.config import Settings


def register_static_routes(app: FastAPI, settings: Settings) -> None:
    frontend = settings.frontend_dir
    documentation = settings.documentation_dir

    if settings.environment == "production":
        for label, directory in (("frontend", frontend), ("documentation", documentation)):
            if not (directory / "index.html").is_file():
                raise RuntimeError(f"Missing {label} build: {directory / 'index.html'}")
        if not (frontend / "assets").is_dir():
            raise RuntimeError(f"Missing frontend assets: {frontend / 'assets'}")

    if (frontend / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="assets")

    if documentation.is_dir():
        app.mount(
            "/documentation",
            StaticFiles(directory=documentation, html=True),
            name="documentation",
        )

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    @app.api_route("/tasks", methods=["GET", "HEAD"], include_in_schema=False)
    async def home() -> FileResponse:
        index = frontend / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=503, detail="Frontend build unavailable")
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    @app.api_route("/favicon.svg", methods=["GET", "HEAD"], include_in_schema=False)
    async def favicon() -> FileResponse:
        icon = frontend / "favicon.svg"
        if not icon.is_file():
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(icon, media_type="image/svg+xml")
