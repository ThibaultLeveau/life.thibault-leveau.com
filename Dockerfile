# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim-bookworm AS python-build
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
COPY backend/src/ backend/src/
RUN uv sync --frozen --no-default-groups --no-editable

FROM python-build AS documentation
RUN uv sync --frozen --no-default-groups --group docs --no-editable
COPY mkdocs.yml ./
COPY docs/ docs/
RUN uv run --no-sync mkdocs build --strict

FROM python:3.13-slim-bookworm AS runtime
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Life" \
      org.opencontainers.image.source="https://github.com/ThibaultLeveau/life.thibault-leveau.com" \
      org.opencontainers.image.revision=$REVISION
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    LIFE_ENVIRONMENT=production \
    LIFE_PUBLIC_BASE_URL=https://life.thibault-leveau.com \
    LIFE_FRONTEND_DIR=/app/static/frontend \
    LIFE_DOCUMENTATION_DIR=/app/static/documentation
RUN groupadd --gid 10001 life && useradd --uid 10001 --gid life --no-create-home life
WORKDIR /app
COPY --from=python-build /app/.venv /app/.venv
COPY --from=frontend /build/frontend/dist /app/static/frontend
COPY --from=documentation /app/site /app/static/documentation
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/ready', timeout=3)"
CMD ["uvicorn", "life_app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
