.PHONY: install dev-db migrate dev-backend dev-frontend dev-docs check test test-ui test-container build docs docker-build deploy smoke

install:
	uv sync --frozen --group docs
	npm --prefix frontend ci

dev-db:
	docker compose -f compose.dev.yaml up -d --wait db

migrate:
	uv run life migrate

dev-backend:
	uv run uvicorn life_app.main:create_app --factory --reload --host 127.0.0.1 --port 8100

dev-frontend:
	npm --prefix frontend run dev -- --host 127.0.0.1

dev-docs:
	uv run --group docs mkdocs serve --dev-addr 127.0.0.1:8101

check:
	uv run ruff check backend
	uv run ruff format --check backend
	npm --prefix frontend run typecheck
	@for script in scripts/*.sh infrastructure/postgres/*.sh; do bash -n "$$script" || exit; done

test:
	bash scripts/test.sh

test-ui:
	npm --prefix frontend run test:e2e

test-container:
	bash scripts/test-container.sh

build:
	npm --prefix frontend run build
	uv run --group docs mkdocs build --strict

docs:
	uv run --group docs mkdocs build --strict

docker-build:
	docker build --build-arg REVISION=$$(git rev-parse HEAD) -t local/life:$$(git rev-parse HEAD) .

deploy:
	./scripts/deploy.sh

smoke:
	./scripts/smoke-test.sh
