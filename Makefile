.PHONY: install dev-db migrate dev-backend dev-frontend dev-docs check test test-ui test-container build docs docs-screenshots docker-build deploy smoke

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
	node --check infrastructure/recipe-browser/server.mjs
	uv run ruff check infrastructure/recipe-egress
	uv run ruff format --check infrastructure/recipe-egress
	uv run ruff check backend scripts/documentation.py scripts/test-assistant-sources.py
	uv run ruff format --check backend scripts/documentation.py scripts/test-assistant-sources.py
	npm --prefix frontend run typecheck
	node --check frontend/scripts/capture-documentation.mjs
	@for script in scripts/*.sh infrastructure/postgres/*.sh; do bash -n "$$script" || exit; done

test:
	python3 -m unittest discover -s infrastructure/recipe-egress -p 'test_*.py'
	bash scripts/test.sh

test-ui:
	npm --prefix frontend run test:e2e

test-container:
	bash scripts/test-recipe-browser.sh
	bash scripts/test-container.sh

build:
	npm --prefix frontend run build
	uv run --group docs mkdocs build --strict

docs:
	uv run --group docs mkdocs build --strict

docs-screenshots:
	bash scripts/capture-documentation.sh

docker-build:
	docker build --build-arg REVISION=$$(git rev-parse HEAD) -t local/life-recipe-browser:$$(git rev-parse HEAD) infrastructure/recipe-browser
	docker build --build-arg REVISION=$$(git rev-parse HEAD) -t local/life-recipe-egress:$$(git rev-parse HEAD) infrastructure/recipe-egress
	docker build --build-arg REVISION=$$(git rev-parse HEAD) -t local/life:$$(git rev-parse HEAD) .

deploy:
	./scripts/deploy.sh

smoke:
	./scripts/smoke-test.sh
