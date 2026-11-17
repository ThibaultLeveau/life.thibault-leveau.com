# Evolving LifeOS

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
├── api.ts
├── types.ts
├── components/
└── styles.css
```

1. Choose an immutable identifier: lowercase letter followed by lowercase letters/digits/underscores, at most 50 characters. Supply FR/EN backend manifest names/descriptions under [ADR 004](decisions/004-internationalisation.md). Reserve a unique HTML path outside `/`, `/applications`, `/api`, `/documentation`, `/assets`.
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

Keep the seven independent guides declared in `mkdocs.yml`: Technical, General, Tasks, Sport, Tracking, OKR Goals and Cook & Shop. Assign every page to a guide and provide the same relative path under `docs/en/`. The `scripts/documentation.py` hook preserves public URLs and isolates navigation/search; explicit links between guides remain available. Refresh synthetic FR/EN screenshots with `make docs-screenshots`, captions, contracts and browser coverage. The existing image still contains a single MkDocs build, with no additional service or storage.
