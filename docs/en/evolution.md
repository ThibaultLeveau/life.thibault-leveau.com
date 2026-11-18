# Evolving LifeOS

## Assistant capabilities {#capacites-de-lassistant}

[ADR 008](decisions/008-assistant-ia.md) approves optional `ApplicationDefinition.actions`. Expose an application by creating `apps/<id>/assistant.py` and an `ActionProvider(actions=(...))`. Each `ActionDefinition` supplies a stable name, description, closed input model, handler, corresponding HTTP method/path, output model, mutation flag and optional confirmation. Arguments combine path/query fields with a `payload` using existing domain schemas. Handlers call domain services without committing: the dispatcher owns the transaction and receipt.

Every business route needs a capability or a tested explicit technical exclusion. Bulk operations, archives and deletion require previews. Operations lacking business versions need a precondition that detects relevant changes after preview. Extract rules found only in routers into services shared with HTTP; never call route functions directly or access another application's domain. Register the provider in the existing manifest and test route coverage, output parity, owners, disabled applications, conflicts and rollback.

Frontend manifests may supply an application-owned lazily loaded `Snippet` renderer. It receives a versioned snippet and callbacks; the shell injects renderers into chat. Cards display server receipt proposals/results, never model-invented confirmations. Reuse components/tokens and check keyboard, FR/EN, themes and 320 px. See the [guide](assistant.md) and [API](assistant-api.md).

## Delivered state {#etat-disponible}

LifeOS has a shared platform, per-account application library and **Tasks**, **Sport**, **Tracking**, **OKR Goals** and **Recipes & Shopping Lists**. Household chores and plants remain future ideas. [ADR 003](decisions/003-applications-lifeos.md) defines the approved organization; earlier ADRs retain architecture/persistence history.

Every application follows the same conventions and isolates its business logic. Folders are not copies of Tasks: reuse authentication, API transport, activation, theme and accessible components.

## Add an application {#ajouter-une-application}

Create a detailed issue, then a branch from current `main`. Applications following the contract below stay within the approved architecture; a new service, storage, framework, deployment mode or boundary change requires new explicit approval.

```text
backend/src/life_app/apps/<id>/
├── __init__.py
├── manifest.py
├── router.py
├── models.py
├── schemas.py
└── service.py
frontend/src/apps/<id>/
├── manifest.ts
├── Page.tsx
├── Settings.tsx       # optional, ADR 007
├── api.ts
├── types.ts
├── components/
└── styles.css
```

1. Choose an immutable identifier: lowercase letter followed by lowercase letters/digits/underscores, at most 50 characters. Supply FR/EN backend manifest names/descriptions under [ADR 004](decisions/004-internationalisation.md). Reserve a unique HTML path outside `/`, `/applications`, `/settings`, `/api`, `/documentation`, `/assets`.
2. Define Pydantic contracts, owner checks and transactional services. Reject unknown fields; derive owner from `CurrentUser`. Routers commit validated mutations. Reuse `core.database.Database` and sessions; no generic repository layer.
3. Define domain-owned tables and, when needed, a migration in global `migrations/versions/`. The manifest imports the router, which loads models. Importing the registry during migrations must load all ORM metadata. Do not edit an old migration.
4. Supply `ApplicationDefinition` in `manifest.py` and import it in `apps/registry.py`. Tuple order determines catalogue order. Default activation is false; migration exceptions require justification. Composition mounts the router with automatic activation checks. New business routes use application-specific prefixes; Tasks retains historical URLs.
5. Supply a same-identifier `manifest.ts` with a `React.lazy` Page and register it. The Page uses `useSession`, `platform/api.ts`, `shared/ui` and `--ui-*` tokens. Compose `ApplicationSidebar`, `ApplicationTopbar` and `ApplicationFooter`; only business links/content differ. Follow AGENTS.md and [shared navigation](frontend.md#navigation-commune-des-applications). Do not recreate login or a parallel user catalogue.
6. Keep business helpers/styles within the application. Forms are transient; every persistent operation/preference has API access. The platform imports no business domain; applications never import one another.
7. Add PostgreSQL HTTP tests, browser flows and a bilingual user guide with screenshots. Extend manifest/boundary contracts and disabled-route coverage across all registered routers. Verify ownership, errors, keyboard/mobile, migrations, backup/restore and preservation through activation toggles. Add both guide translations to `mkdocs.yml`.
8. Run `make check`, `make test`, `make build`, build/test the image, review the diff and open an issue-linked PR. Record review, wait for latest-commit CI, merge, then deploy current validated `main` following [Deployment](deploiement.md). Verify SHA, HTTPS, probes and affected flows before concluding.

Backend manifest illustration (not a delivered application):

```python
from life_app.platform.applications.definition import ApplicationDefinition
from life_app.apps.example.router import router

application = ApplicationDefinition(
    id="example", name="Example", description="Application description.",
    path="/example", icon="grid", router=router,
)
```

Frontend illustration:

```typescript
import { lazy } from "react";
import type { ApplicationModule } from "../../platform/applications/definition";

export const application: ApplicationModule = {
  id: "example",
  Page: lazy(() => import("./Page").then(({ Page }) => ({ default: Page }))),
};
```

## Lifecycle and migrations {#cycle-de-vie-et-migrations}

The library stores only personal activation. Disabling deletes, completes or archives nothing; re-enabling returns the same objects. Removing code must not silently delete preferences/tables. Document permanent removal separately.

Create a new migration for each delivered schema change. Test constraints, upgrade/downgrade, previous-image compatibility and synthetic restore. Migration remains an explicit publication command. An older image never reverses the schema.

Preserve Tasks `completed`, `reopened`, `rescheduled`, `completion_undone` events, UTC instants and historical context. Future statistics must distinguish completions, unique tasks and cycle delays; archiving/disabling is not completion. See [invariants](donnees.md).

## Ship translations with features {#traductions-livrees-avec-les-fonctionnalites}

Each application owns FR/EN catalogues with semantic keys and complete sentences. Reuse common engine, i18next plurals and locale formatting; never translate personal text. Add server errors/scheduling examples in both languages and extend parity tests. See [translation organization](internationalisation.md#organisation-des-traductions).

## Add a metrics source {#ajouter-une-source-de-metriques}

[ADR 005](decisions/005-integrations-tracking.md) approves optional `ApplicationDefinition.metrics`. Implement `catalogue()`, `options(db,user,filter_id,q,offset,limit)` and `evaluate(db,user,query)` in `apps/<id>/integrations.py`, then supply its instance in the manifest. The existing registry is the only composition point. `platform/integrations` owns neutral contracts/checks, not business models. Consumers use injected services/shared API, never other applications’ tables/imports.

Each metric defines stable ID, FR/EN name/description, unit, aggregations/filters and historical/current semantics. Providers validate ownership and bound reads. Document events, timezones, archives, undo, missing samples and comparability. Do not reconstruct history from current attributes. Return `missing`/`unavailable` for unknown results; only genuine empty counts equal zero.

Extend discovery, owner, disabled-source, temporal-boundary and error tests plus the [delivered catalogue](integrations.md). `shared/ui/ApplicationNavigation` reuses navigation through slots; Pages retain login/navigation guards and inject account elements. No `shared` import of `platform`.

Reusable metric HTTP/types live in `frontend/src/platform/integrations/`; configuration/input components stay Tracking-owned.

## Add application progression {#ajouter-la-progression-dune-application}

[ADR 006](decisions/006-progression-applications.md) approves `ApplicationDefinition.progression`. Implement `apps/<id>/progression.py` with stable localized quests, ten titles, reward scale and owner-limited history. Convert first business confirmations to `Activity` (stable key, UTC instant, XP, counters, dimensions), then call the shared engine inside the existing transaction. Keys survive corrections/reopening and identify distinct occurrences where supported. Never read another application’s tables.

Declare the provider in the manifest; the registry stays the only composition point. Inject `ProgressionBadge` into shared topbar `status`. Use `/progression` for reads/settings, never award points in the browser. Document uniqueness, corrections, active days, retroactivity, backfill and scale. Test quest/translation counts, ownership, concurrency, activation, deduplication and restore. Contract/boundary changes require new explicit approval.

## Recipes available {#recettes-disponible}

**Recipes & Shopping Lists** (`recipes`, `/recipes`) is delivered and disabled by default. Bilingual catalogue, recipes, lists/templates, shopping mode and Tracking/progression providers reuse existing contracts. [Guide](recipes.md), [API](recipes-api.md). Household chores and plants remain future ideas.

## Evolving the documentation

Keep the eight independent guides declared in `mkdocs.yml`: Technical, General, Life AI, Tasks, Sport, Tracking, OKR Goals and Cook & Shop. Assign every page to a guide and provide the same relative path under `docs/en/`. The `scripts/documentation.py` hook preserves public URLs and isolates navigation/search; explicit links between guides remain available. Refresh synthetic FR/EN screenshots with `make docs-screenshots`, captions, contracts and browser coverage. The existing image still contains a single MkDocs build, with no additional service or storage.

## Settings panel

[ADR 007](decisions/007-reglages-generaux.md) allows an optional `Settings.tsx` in each application, loaded lazily through its manifest. Implement `SettingsPanelProps` (`onDirty`, `onBusy`), clear these states on unmount and use existing business APIs. Do not import the whole Page or move business logic into the platform. The shell supplies names, activation and the common calendar. Settings links open `/settings?application=<id>`; contextual settings can remain on their objects with an explicit panel link. Test drafts, errors, conflicts, sessions, activation and FR/EN/mobile navigation.

## Snippet details

A renderer keeps a compact business summary and uses `platform/assistant/components/SnippetDetails` for complete receipt content (`snippetValue`). Labels and value formatting stay in `apps/<id>/assistant/`; the platform knows no business module. Do not truncate data in reading helpers. Long texts use the accessible disclosure in `shared/ui/SnippetSummary`. Test long lists, the final item, text beyond 1,500 characters, zero, booleans, small decimals, pagination and FR/EN/mobile modes.

## Assistant sources

[ADR 009](decisions/009-sources-assistant.md) authorizes multimodal sources and dictation, now within `apps/life_ai` (ADR 011). Extensions must preserve formats/budgets, ownership, CSRF, admission before I/O, post-processing revalidation and separation of sources from direct instructions. Add blocks to all three adapters and FR/EN errors; never add unrestricted fetching to business tools. Sources must survive history and support API deletion. Cover hostile parsing, SSRF, idempotency, injection/confirmation, memory, compaction, cancellation, quotas, migration/restore and mobile/keyboard UI. New services, storage or broader access require a new explicit agreement.

Recipes web import is implemented under [ADR 010](decisions/010-import-web-recettes.md): isolated browser, human interaction, AI extraction in the account language, reviewed draft and persistent attribution. This is no longer a proposal.

## Preserve Dashboard and Life AI

Follow [ADR 011](decisions/011-dashboard-life-ai.md): Dashboard builds cards from the API catalogue; new applications appear without a second catalogue. Use `ApplicationPageProps` for Pages. Launch intents are transient, consumed once and protected by draft guards and server idempotency. Life AI follows the common activation lifecycle. Reuse providers and platform `structured.py` for another domain's generation, without importing Life AI. Extend nested-route, migration and navigation tests and document behavior with FR/EN screenshots.
