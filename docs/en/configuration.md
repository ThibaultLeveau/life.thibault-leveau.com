# Configuration

Pydantic Settings prioritizes process variables over `.env`. Run local commands from the repository root. `.env.example` configures development; `.env.production.example` is the Compose secrets template. Real environment files and backups stay outside Git and the image.

## Application {#application}

| Variable | Default | Scope |
| --- | --- | --- |
| `LIFE_ENVIRONMENT` | `development` | `development`, `test`, `production`; enables the Secure cookie in production |
| `LIFE_PUBLIC_BASE_URL` | `http://localhost:8100` | Allowed origin for browser writes |
| `LIFE_DATABASE_URL` | absent | `postgresql+psycopg://user:password@host:port/database` |
| `LIFE_SESSION_HOURS` | `168` | Fixed session lifetime, 1–720 hours; no automatic extension |
| `LIFE_ASSISTANT_ENCRYPTION_KEYS` | absent | Comma-separated Fernet keys; first key encrypts new AI tokens |
| `LIFE_ASSISTANT_TIMEOUT_SECONDS` | `600` | Maximum AI turn duration, 10–600 seconds |
| `LIFE_ASSISTANT_MAX_MODEL_CALLS` | `96` | Model calls per turn, 1–256; shared by coordinator, specialists and summaries |
| `LIFE_ASSISTANT_MAX_ACTIONS` | `200` | Business actions per turn, 1–1,000; imports count as one action |
| `LIFE_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `LIFE_FRONTEND_DIR` | `frontend/dist` | Frontend artifacts; relative paths resolve from the repository root |
| `LIFE_DOCUMENTATION_DIR` | `site` | MkDocs artifacts; relative paths resolve from the repository root |

Without a database URL, `/api/v1/health` and public files remain available; private features and `/api/v1/health/ready` return 503. The probe checks database readiness; startup does not migrate it. Incompatible SQL URLs are rejected.

Without a valid AI keyring, saving or decrypting provider tokens is unavailable; applications and probes remain usable. Generate a key with `uv run python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'` in a private terminal, store it in protected `.env.production` and back it up separately from database dumps. Never use an example key or a key printed in public logs. Older keys support decryption and [rotation](sauvegardes.md#migration-0015-assistant).

Provider, model and user token are account preferences managed through the [Assistant API](assistant-api.md), not frontend variables. Adapters only use `api.openai.com`, `api.anthropic.com` and `generativelanguage.googleapis.com` over HTTPS; arbitrary provider URLs are not accepted. The `web` container joins the non-internal Compose `egress` bridge, providing an outbound route and DNS resolution for those hosts. Host restrictions are enforced by the application; the bridge does not filter domains.

`LIFE_PUBLIC_BASE_URL` must be the exact origin with no subpath: `http://localhost:5173` in development, `https://life.thibault-leveau.com` in production. It configures neither DNS nor Caddy. Vite’s proxy avoids CORS; no general CORS policy is opened. In development/test, the backend’s own origin is also accepted.

## PostgreSQL and Compose {#postgresql-et-compose}

| Variable | Purpose |
| --- | --- |
| `LIFE_IMAGE` | `local/life:<full SHA>` supplied by the deployment script |
| `LIFE_POSTGRES_PASSWORD` | Password for the non-administrator `life` application role |
| `LIFE_POSTGRES_ADMIN_PASSWORD` | Separate PostgreSQL administrator password |
| `LIFE_DATABASE_URL` | Application connection using the same password as `LIFE_POSTGRES_PASSWORD`, host `db`, database `life` |

Copy `.env.production.example` to `.env.production`, replace placeholders with two distinct random passwords and protect the file (`chmod 600`). Hexadecimal values avoid reserved URL characters. Do not print `docker compose config` without `--quiet` in public logs: its output includes interpolated secrets.

Compose creates `life_egress` for `web` alone, without another variable or published port. Keep `database` internal and the existing external `multisite_proxy` network in its internal state. “External” means Compose does not manage that network; it does not grant Internet access. With only those two networks, probes can be healthy while the assistant cannot reach its provider. See [verification from the container](deploiement.md#sortie-https-des-fournisseurs).

PostgreSQL initialization creates `life` as database owner without superuser, database-creation or role-creation privileges. It runs only on an empty volume. Editing the environment file does not change an existing role’s password: coordinate PostgreSQL administration and the new connection URL when rotating it.

| Service | Listening address |
| --- | --- |
| Local Vite | `127.0.0.1:5173` |
| Local FastAPI | `127.0.0.1:8100` |
| Local MkDocs | `127.0.0.1:8101` |
| Local PostgreSQL | `127.0.0.1:8102` |
| Production application | `8000`, Docker network `multisite_proxy`, alias `life-web` |
| Production PostgreSQL | `5432`, private Compose network `database`, no host port |

Secrets are server settings. Names, colors, ordering, filters and themes are **business data**, changed through the [API](api.md), never frontend environment variables.

**Upcoming** preferences belong to the account: period (today/tomorrow/week/custom), 1–90-day horizon, overdue/completed inclusion and filters. They use `/api/v1/agenda/view`; no extra environment setting is needed.

## AI source quota and dictation

`LIFE_ASSISTANT_SOURCE_QUOTA_BYTES` bounds files and extracted text stored per account (default `209715200`, 200 MiB; range 20 MiB–2 GiB). `GET /api/v1/assistant/sources/limits` exposes it. Format/message/processing limits remain conservative in the assistant module. A reservation counts 10 MiB before import; allow this headroom even for a small file. Lowering quota never deletes data but may block imports until space is freed.

Personal dictation settings use `/assistant/transcription/settings` and require no additional server secret: `LIFE_ASSISTANT_ENCRYPTION_KEYS` also protects an optional separate credential. Chat reuse selects OpenAI `gpt-transcribe` or the chat’s Gemini model. Explicitly choose a separate model/token if needed. No silent fallback between providers.
