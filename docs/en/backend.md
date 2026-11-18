# Backend

`life_app.main:create_app` assembles FastAPI, configuration, connections, routes and static files. Installing `backend/src/` also exposes the `life` command; no manual `PYTHONPATH` adjustment is needed.

`apps/tasks/recurrence.py` validates day/week/month/year rules and calculates dates with python-dateutil. Search skips old calendar phases and bounds impossible-rule checks by the Gregorian cycle. Common impossible combinations (31 February, a weekday incompatible with a seven-day interval) are rejected without searching millennia. `scheduling.py` parses the account’s French or English and preserves original text offsets, including combining accents and emoji. Parsing and previews do not change tasks; completion, movement and status edits share one atomic transition. See [occurrence invariants](donnees.md#recurrences-et-occurrences) and [contracts](api.md#planification-et-recurrences).

| Module | Responsibility |
| --- | --- |
| `core/config.py`, `core/logging.py` | Typed settings, standard output and query-string removal from access logs |
| `core/database.py` | PostgreSQL engine, pool and one SQLAlchemy session per request |
| `platform/auth/` | Accounts, sessions, login limits, contracts and authorization |
| `apps/tasks/` | Relational models, Pydantic contracts and business rules |
| `apps/<id>/router.py`, `platform/*/router.py` | HTTP translation and explicit commits |
| `api/router.py` | Versioned composition and shared activation guard |
| `platform/applications/` | Catalogue, manifest contract and per-owner activation |
| `api/health.py` | Process liveness and database/migration readiness |
| `web/static.py` | Explicit public routes and permitted artifacts |
| `migrations/` | Alembic history packaged in the application and image |
| `cli.py` | Migration, account creation and password reset |

## Shortcut grammar {#grammaire-des-raccourcis}

`scheduling_language.py` tokenizes normalized text with original offsets and reads French numbers, ordinals and dates. `scheduling_grammar.py` reads clauses with shared list/range readers and assembles a temporary `CalendarSpec`: one cadence, selections, bounds, exceptions and calculation mode. Compilation checks conflicts before producing the existing `Recurrence`. Annual dates associated with different days are never flattened into a Cartesian product. Standalone numbers in a title do not become calendar selections.

`scheduling.py` locates the expression, protects quoted text, preserves the title and exposes diagnostics. It calculates the calendar only after validating the entire composition. The API caps input at 1,000 characters; the engine retains limits on rules, excluded dates and completion counts. Text is neither stored nor sent to third parties. Unknown expressions remain literal; incomplete or conflicting expressions produce no partial rule.

Extend the lexicon or a clause reader for new vocabulary, then test combinations in several orders. Avoid a new regular expression for every complete sentence. The [user guide](taches.md) explains anchors, durations, occurrence counts and limits.

## Transactions and concurrency {#transactions-et-concurrence}

Synchronous FastAPI routes use synchronous SQLAlchemy/psycopg access. A request shares one SQL session and closes it at the end; failure rolls back uncommitted mutations. Routers commit after validating results. Services record tasks and events in the same transaction.

Each authenticated mutation locks the user row before reading mutable objects. This serializes one owner’s writes, including moves between workspaces. Tasks also require `expected_version`; stale edits return 409 instead of silently overwriting changes. Reordering can update the versions of other tasks whose positions change.

Reads do not take that lock. Paginated lists are not snapshots spanning requests: clients traversing many pages during edits must refresh. The frontend loads all pages for the personal view without virtualization.

Every business route applies server-side authentication. Owner identifiers never come from client input. Services and composite foreign keys validate workspace/section/status/label references. See [Data](donnees.md) and [Security](securite.md).

## Errors and contracts {#erreurs-et-contrats}

Schemas reject unknown fields. PATCH distinguishes absence from `null`; only `section_id` and `due_date` can be cleared to `null` on a task. Validation errors omit submitted values. SQL conflicts become 409; other database errors become 503, without SQL statements or personal values in responses.

Column constraints and indexes are fixed in explicit migrations. Do not recreate the schema with `create_all` at startup. Generate a new migration, review its effects, test the transition and document previous-image compatibility.

```bash
uv run alembic revision --autogenerate -m "description"
uv run life migrate
make test
```

Never rewrite a published migration. `alembic.ini` supports development; the packaged command locates migrations without needing that file at runtime.

## HTTP delivery {#distribution-http}

`/`, `/applications` and manifest routes (`/tasks`, `/sport`, `/tracking`, `/okr`, `/recipes`) serve the React shell. `/tasks?space=<UUID>` opens an authorized workspace; an unknown identifier falls back to the first active workspace. `/assets/`, `/favicon.svg` and `/documentation/` serve dedicated artifacts. Other paths remain 404, including unknown API routes. No working directory, secret or backup is exposed.

Tests combine temporary routing artifacts with real PostgreSQL for private features. See [Tests](tests.md) and [API reference](api.md).

## Messages and language {#messages-et-langue}

`core/i18n.py` binds a context to each request; session resolution applies the owner’s preference. Concurrent requests are isolated, including synchronous FastAPI dependencies. Each domain owns `messages.py` and FR/EN JSON. `Message` retains a stable code with translated text. Validation exposes localized errors without submitted values.

`scheduling_english.py` adapts English vocabulary to shared grammar tokens while preserving original Unicode offsets. There is no external model or new rule format. Both languages’ help examples are tested. See [Language and API](internationalisation.md#api-independante-de-linterface).

## Progression {#progression}

`platform/progression` applies level/calendar rules, stores first confirmations and awards unique quests. Application-owned providers are injected through manifests. The service imports no business domain; mutations use the existing user lock and transaction. GET requests never award points. `life backfill-progression <account> [--dry-run]` explicitly imports a named account’s history. See [API](api.md#progression-par-application), [data](donnees.md#donnees-de-progression) and [ADR 006](decisions/006-progression-applications.md).

## Life AI domain

`apps/life_ai` owns existing `/api/v1/assistant/*` routes except shared `/provider-settings`. Registry composition also guards source and dictation subrouters. `execution.authorize` rechecks Life AI before each step; import and transcription responses reacquire the owner lock and revalidate session/activation. Capability discovery selects only definitions with `actions`, preventing recursive delegation to chat. Providers and structured generation remain independent of conversation tables.
