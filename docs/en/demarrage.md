# Getting started

## Install {#installer}

Requirements: Git, [uv](https://docs.astral.sh/uv/getting-started/installation/), Python 3.13, Node.js 24/npm, Make and Bash. Docker Engine with Compose v2 provides local PostgreSQL and container tests. Use WSL on Windows.

```bash
git clone https://github.com/ThibaultLeveau/life.thibault-leveau.com.git
cd life.thibault-leveau.com
make install
cp .env.example .env
make dev-db
make migrate
uv run life create-user thibault
```

`make install` installs locked Python, documentation and frontend dependencies. `make dev-db` uses the separate `life-development` Compose project, a persistent volume and local port `8102`. The example PostgreSQL password is for development only. Account creation prompts for and confirms a password of 12–1,024 characters.

If PostgreSQL is already available, configure `LIFE_DATABASE_URL` and migrate; local development then does not require Docker. Never point development or tests at the production database.

## Start {#demarrer}

In three terminals at the repository root:

```bash
make dev-backend
make dev-frontend
make dev-docs
```

| Address | Purpose |
| --- | --- |
| `http://localhost:5173/tasks` | Interface with hot reload |
| `http://127.0.0.1:8100/api/docs` | Interactive OpenAPI |
| `http://127.0.0.1:8101/documentation/` | Documentation preview |

Vite keeps a single origin: `/api` proxies to FastAPI and `/documentation` to MkDocs. Open **localhost:5173**, matching `LIFE_PUBLIC_BASE_URL`. For another origin, update the variable and restart FastAPI; otherwise writes return 403.

Without a build, backend static routes such as `/` and `/tasks` may return 503; use Vite or run `make build`. The API and readiness probe work independently of frontend files.

```bash
curl --fail http://127.0.0.1:8100/api/v1/health/ready
```

## Local account and data {#compte-et-donnees-locales}

```bash
uv run life reset-password thibault
```

Resetting the password revokes every session for that account. There is no public sign-up. Create data through the interface or [API examples](api.md); no demonstration data is imposed at first launch.

```bash
docker compose -f compose.dev.yaml stop db
```

This preserves the volume. `down --volumes` deletes development data; use it only to deliberately restart with an empty database, then rerun migrations and account creation.

## Validate {#valider}

Follow [Tests](tests.md) before opening a PR. Production commands and secrets are separate; see [Deployment](deploiement.md).
