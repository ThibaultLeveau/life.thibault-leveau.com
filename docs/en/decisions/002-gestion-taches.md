# ADR 002 — Persistent tasks and personal access

Translation of the [unchanged French historical decision](../../decisions/002-gestion-taches.md).

**Status:** accepted by Thibault on 13 November 2026.

**Approval:** “I approve this architecture” (translated), recorded in [issue #3](https://github.com/ThibaultLeveau/life.thibault-leveau.com/issues/3#issuecomment-6863108670).

## Context

Workspaces, sections and tasks require persistence, private access and usable history for future statistics. ADR 001 remains the record of the initial architecture without storage.

## Decision

Keep FastAPI, React/TypeScript, Vite, MkDocs and the shared application image. Add `features/tasks` and `features/auth` business modules, routers under `api/v1` and connection management in `core/database.py`.

Use PostgreSQL 17, synchronous SQLAlchemy 2 and Alembic. PostgreSQL has a private Compose service and persistent volume. Each mutation and its events share a transaction. Integration tests also use PostgreSQL. Migrations are an explicit command; no worker changes the schema at startup.

Use a command-created personal account, Argon2 password hashing and opaque sessions revocable in the database. The browser receives an HttpOnly, SameSite=Lax cookie, also Secure in production. Writes require a CSRF token and origin verification. Database login limits share protection across processes. Do not open public registration.

Each workspace belongs to a user. Sections and statuses differ: a section creates a list or kanban row; a status creates a column. References are constrained to the same workspace. Owner mutations are serialized to preserve order and transitions; task versions detect concurrent edits.

Keep immutable creation, movement, completion, reopening and archiving events with UTC dates and contextual identifiers. Identifiers survive renaming; retain useful event-time context without copying task content. Archiving is not completion. A task can have multiple completions, each optionally followed by reopening.

Every business action and persistent preference is available through `/api/v1` and documented in OpenAPI. Frontend routes are explicitly allowed; unknown paths remain 404. A React drag-and-drop library may complement accessible movement commands without changing the framework.

## Alternatives

- SQLite would simplify operations, but PostgreSQL matches the project direction and tests constraints/concurrency on the production engine.
- OIDC would avoid local password handling but add an external dependency and unnecessary account configuration for personal use.
- Browser storage would not meet API access, centralized data or statistical-use requirements.
- Separate frontend/API services offer no benefit within this scope.

## Consequences

A database service, volume and secrets are now required. PostgreSQL backup/restore and migrations become operational responsibilities. An older image does not restore the database; future migrations must preserve compatibility or provide an explicit restore procedure. Backups contain private data and must be protected.

Deployment stays manual and separate from merging. Production accounts have no default password. Statistics are outside this delivery; dates and the journal are designed to enable them later.
