# Architecture

## Overview {#vue-densemble}

Life retains the FastAPI / React / MkDocs monorepo. One Uvicorn process serves the API, compiled frontend and documentation. PostgreSQL 17 is the only added data service, under [ADR 002](decisions/002-gestion-taches.md).

![Production flow: browser, Caddy, application and private PostgreSQL.](../assets/diagrams/en/production.svg)

[Mermaid source](../assets/diagrams/en/production.mmd)

Caddy terminates TLS and forwards to `life-web:8000` on `multisite_proxy`. The web service also joins the private Compose `database` network. PostgreSQL never joins the proxy network or publishes a host port; `postgres_data` persists its data. The application role owns its database without cluster-administration privileges.

In development, Vite, FastAPI and MkDocs have separate servers; Vite’s proxy keeps one origin. `compose.dev.yaml` provides a local PostgreSQL instance independent of production.

Application organization follows [ADR 003](decisions/003-applications-lifeos.md). Explicit registries assemble applications; the platform does not depend on business domains.

## Responsibilities {#responsabilites}

| Folder | Responsibility |
| --- | --- |
| `core/` | Settings, logging, engine and SQL sessions |
| `platform/auth/` | Login/authorization contracts, models and services |
| `apps/<id>/` | Each application’s manifest, routes, contracts, models and services |
| `apps/registry.py` | Explicit composition of available applications |
| `platform/applications/` | Manifest contract, catalogue, activation and access guard |
| `api/router.py` | `/api/v1`, platform routes and activation guard on each business router |
| `web/` | Controlled static-file delivery |
| `migrations/` | Immutable, versioned schema changes |
| `frontend/src/app/` | Shared session, explicit routing and enabled-app loading |
| `frontend/src/apps/<id>/` | Business page, components, types, styles and API |
| `frontend/src/components/layout/` | Home navigation |
| `frontend/src/platform/` | Session, theme, HTTP/CSRF transport and library |
| `frontend/src/shared/` | Reusable icons, accessible dialogs and styles |
| `frontend/src/styles/` | Global tokens and styles |
| `docs/` | Public documentation without personal data |
| `infrastructure/` | Caddy integration and PostgreSQL role initialization |
| `scripts/` | Explicit tests, publication, backup and restore |

Business services use SQLAlchemy directly: no generic repository layer, message queue or additional microservice. Request dependencies share one SQL session. Owner mutations are serialized and tasks use version numbers. See [Backend](backend.md) and [Data](donnees.md).

## Business flow {#flux-metier}

1. The browser creates an API session and receives an opaque HttpOnly cookie.
2. Reads check session, application activation and owner. Writes also check origin and CSRF.
3. The router calls the service: validation, mutation and events share one PostgreSQL transaction.
4. Tasks immediately renders transient in-memory intentions and saves through existing APIs in the background. Server responses confirm or restore values; indirect effects trigger reconciliation. View, theme and language preferences always use the API.

React stores no parallel business database in localStorage. Input fields and dialog state are transient. Task mutations require `expected_version` and return 409 if another write changed the task.

## HTTP and builds {#http-et-compilation}

`/`, `/applications`, `/settings` and manifest paths (`/tasks`, `/sport`, `/tracking`, `/okr`, `/recipes`) are the only React HTML routes. Assets live under `/assets/`, API under `/api/v1`, Swagger under `/api/docs` and MkDocs under `/documentation/`. Unknown paths remain 404. Frontend API URLs are relative; rendering has no separate network service.

![Multi-stage build: compiled frontend and documentation join the Python runtime.](../assets/diagrams/en/build.svg)

[Build Mermaid source](../assets/diagrams/en/build.mmd)

The runtime includes application Python dependencies, CLI, migrations and compiled files. Node, Vite, Playwright and MkDocs do not run in production. The runtime user is unprivileged and its filesystem read-only.

uv/npm lockfiles are versioned. Images carry the full source SHA, although base-image tags can change between rebuilds. Retain the deployed image and database backup. An older image never reverses a migration.

## Chosen limits {#limites-choisies}

This is a personal application: no workspace sharing, public registration, SSO, real-time synchronization, attachments or offline synchronization. Sport provides internal statistics; Tracking consumes Task events and Sport results through injected metric providers. No screen time is collected. Search uses SQL substring matching and the frontend loads every task in a view; large volumes would require measured pagination/indexing improvements.

Recurrence stays inside `apps/tasks`: `recurrence.py` validates/calculates dates using python-dateutil; `scheduling.py` parses account-language French or English. Completion advances the task in the existing transaction without a scheduler or additional service. The frontend requests parsing/preview from the API and retains only temporary drafts.

French parsing delegates vocabulary/numbers to `scheduling_language.py` and clause parsing/composition to `scheduling_grammar.py`. These internal Tasks helpers compile to the existing `Recurrence` contract; there is no new persistent format, dependency or external interpretation service.

The [initial ADR](decisions/001-architecture-initiale.md) remains unchanged. Structural changes require the repository’s explicit-approval process.

## Activation and boundaries {#activation-et-frontieres}

Composition injects the backend registry into `app.state.applications`. Platform services receive definitions without importing applications. The frontend registry maps the same identifiers to lazy Pages; API responses supply names, descriptions, paths and states. No business imports cross application boundaries.

`platform/auth/SessionProvider` owns session and theme. `platform/applications/ApplicationProvider` loads activation and refreshes on return to the foreground. The shell unmounts Pages on disable, expiry or sign-out. The server guard in `api/router.py` remains authoritative, including direct requests. Shared components do not require Tasks CSS.

See [contracts/invariants](donnees.md#activations-des-applications), [API](api.md#bibliotheque-et-activation) and [adding an application](evolution.md).

## Approved internationalization {#internationalisation-approuvee}

[ADR 004](decisions/004-internationalisation.md) adds account language and i18next/react-i18next. `platform/i18n/` initializes the engine; `shared/locales` owns common text and each application its resources. `core/i18n.py` provides request context without importing business domains; domains load their own messages. Localized metadata remains in backend manifests. Sport separates identifiers/text and localizes responses without rewriting snapshots. `scheduling_english.py` joins the existing grammar. See [Internationalization](internationalisation.md).

## Integrations and Tracking {#integrations-et-suivi}

[ADR 005](decisions/005-integrations-tracking.md), approved on 16 November 2026, adds optional manifest `metrics`. `platform/integrations/` owns neutral contracts, periods, discovery, validation and activation checks. Implementations stay in `apps/tasks/integrations.py` and `apps/sport/integrations.py`. The injected registry is the sole composition point. Domains never read one another’s tables. Private options/evaluations require source activation and ownership; discovery includes only metadata public to the signed-in account.

`apps/tracking` owns definitions, revisions, periods, values, snapshots and history. Its service computes scores, XP and calendar from that data. Sources are explicitly refreshable snapshots, without background calculation or another service. Global migration `0009_tracking` adds five tables and protects histories from updates/deletion.

Tasks, Sport and Tracking compose `shared/ui/ApplicationNavigation` with their navigation, account menu and actions. The component depends on no application/session service. Tracking uses shared transport and `platform/useApiResource` to cancel or ignore stale reads. See [integrations](integrations.md), [data](donnees.md#donnees-de-suivi) and [API](tracking-api.md). Reusable metrics HTTP/types live in `frontend/src/platform/integrations/`; configuration/input components belong to Tracking.

## Shared progression {#progression-commune}

[ADR 006](decisions/006-progression-applications.md), approved on 16 November 2026 in issue #58, adds `platform/progression`: shared level/streak engine, preferences and PostgreSQL journal. Manifests carry optional `progression` providers. Each application owns its catalogue and converts only its own data to activities. The registry remains the only composition point. Confirmations record facts/rewards in the business transaction; HTTP reads have no side effects. Historical backfill explicitly targets a named account.

Frontend `platform/progression` supplies API client, settings and the badge injected into `ApplicationTopbar`’s neutral `status` slot. `shared` still depends on neither platform nor applications. Tracking composes the wall/journal; other badges work independently of its activation. Ownership, CSRF, activation and stale-response protection remain. Per-application usage days extend existing JSONB preferences/calculations without changing provider contracts or boundaries. See [API](api.md#progression-par-application), [data](donnees.md#donnees-de-progression) and [guide](progression.md).

## OKR Goals {#objectifs-okr}

`apps/okr` adds objectives, key results and quarterly history under ADR 003. Its `integrations.py`/`progression.py` follow ADRs 005/006. Both registries are the only composition points; there is no new infrastructure or boundary change. Additive migration `0011_okr` adds three tables. Key results/snapshots stay JSONB in PostgreSQL; only drafts are transient in React. See [guide](okr.md), [API](okr-api.md), [data](donnees.md#donnees-okr).

## Recipes and shopping {#recettes-et-courses}

`apps/recipes` follows ADRs 003–006 with no new cross-cutting contract: manifest, business logic, metrics and progression providers compose through existing registries. `0012_recipes` adds six tables for supplied/private ingredients, recipes/items, lists/templates/items and events. The bilingual 301-ingredient catalogue is fixed in migration data. PostgreSQL stores quantities as `NUMERIC(18,6)`; services calculate with `Decimal`. No browser business storage or external service. Shared boundaries remain unchanged. [Guide](recipes.md), [API](recipes-api.md).

## Separate documentation guides

The seven FR/EN guides share the existing MkDocs build and static server. `mkdocs.yml` assigns pages to guides; `scripts/documentation.py` supplies navigation, previous/next links and search indexes scoped to each guide and language. The language link opens the equivalent page; an explicit link returns to the directory. Existing source paths and URLs remain stable, with technical translations under `docs/en/`. No service, storage or business boundary changes.

## General settings

[ADR 007](decisions/007-reglages-generaux.md), approved in issue #76, extends the frontend manifest with an optional `Settings` panel. The shell composes `/settings` from the existing registry and server catalogue. Business forms stay in their applications; shared preferences stay in their existing modules. Panels report drafts/pending writes and business panels mount only for enabled applications. No additional table, API or infrastructure. See the [guide](settings.md).
