# Tests and quality

## Required checks {#controles-obligatoires}

From the repository root:

```bash
make install
make check
make test
make build
```

Make check runs Ruff, Python formatting, TypeScript (UI/browser tests) and shell syntax. Make build compiles Vite and strict MkDocs. Exact dependencies are locked.

## Python and PostgreSQL {#python-et-postgresql}

Make test starts disposable PostgreSQL 17 on loopback, waits for readiness, runs pytest and removes container/anonymous volumes. With LIFE_TEST_DATABASE_URL it uses that test server and creates/removes a random schema. Missing database does not silently skip business tests. Never use production.

Readiness checks TCP on 127.0.0.1: initialization may answer on a Unix socket before TCP is ready.

```bash
LIFE_TEST_DATABASE_URL=postgresql+psycopg://user:password@127.0.0.1:5432/test make test
```

Coverage includes explicit routing/missing files/HEAD/traversal/OpenAPI; initial migration and ORM schema parity; atomic CRUD/order/filter/pagination/preferences; hierarchy/cycles/ownership/archive/concurrent reparenting and creation-versus-archive; migration 0002 data preservation; agenda bounds/overdue/archives/owners/leap/year boundaries; completion/reopening/idempotence/cross-workspace snapshots; recurrence grammar/calendar/exclusions/DST/limits/parse-preview-create parity/undo/end/archive/conflicts/0004 constraints; parent/individual archives and status changes without false completion; SQL constraints/rollback/immutable events; concurrent completion with one winner; sessions/CSRF/origin/owner isolation/rate limiting/expiry/Secure cookies/password reset; no private search/input values in logs/errors.

Routing tests use small synthetic artifacts and do not replace real-image validation.

## Image, browser and backup {#image-navigateur-et-sauvegarde}

`scripts/test-container-network.sh`, run at the start of `make test-container`, loads the real `compose.yaml` in a disposable project with an internal proxy. It checks web network attachments, PostgreSQL isolation and the absence of published ports, then Docker DNS, a synthetic HTTP response on `egress` and the default route through its gateway. It contacts no provider or Internet service. Real DNS/TLS checks for all three providers remain a [deployment step](deploiement.md#sortie-https-des-fournisseurs).

```bash
make docker-build
(cd frontend && npx playwright install --with-deps chromium)
make test-container
```

The script creates private networks, disposable PostgreSQL/web, a non-admin application role, packaged migrations and a synthetic account. Loopback HTTP uses a dynamic port. Runtime is read-only with production capability restrictions. Only test environment relaxes Secure cookies; HTTP tests verify production flags.

Smoke checks cover public routes/database readiness, rejected anonymous access, bundles, MkDocs search and real 404s. Playwright covers forms, complete task lifecycle, row/column dragging, list ordering, themes, 320/375 px mobile, keyboard, cross-workspace movement and conflicts. Hierarchy scenarios cover subtree moves/root return/sibling order/mobile and parent-first restore with API/reload checks. Agenda covers multiple workspaces, saved periods/actions/API parity, list/board dates, local midnight/DST and failed saves. Compiled CSS colors are checked.

The script restores a dump into a second disposable database, compares events/parents/preferences, verifies revoked sessions, removed obsolete objects and rollback after errors, then migrations/immutability. Cleanup removes only script-created resources.

Scheduling browser tests cover immediate recognition/editor/quick-add, literal text, monthly exceptions, API persistence, completion/undo, mobile calendar keyboard/themes. Grammar tests cover written numbers/ordinals/lists/ranges/alternation/positions/bounds/exceptions, 120 permutations of independent clauses, cadence order, partial input, false positives and deterministic malformed vocabulary. HTTP tests check diagnostics, input bounds and CSRF. Browser tests include immediate incomplete saves, literal choice and mobile help.

To target another local image:

```bash
LIFE_TEST_IMAGE=local/life:ma-validation make test-container
```

To rerun one suite on an existing **test** server:

```bash
LIFE_E2E_URL=http://127.0.0.1:8100 \
LIFE_E2E_USERNAME=compte-test LIFE_E2E_PASSWORD=mot-de-passe-synthetique \
npm --prefix frontend run test:e2e -- mobile-comfort.spec.ts
```

These scenarios create real data on the selected server, never production. Prefer make test-container for the full suite: it clears login-limit counters only in its disposable database between files, without weakening the production 30/IP/15-minute limit. Make test-ui does not reset a supplied server. Captures/traces stay ignored under frontend/test-results/, grouped by suite in container runs. Traces can contain cookies/data; only synthetic failure artifacts are uploaded by CI, retained seven days.

## CI and review {#ci-et-revue}

GitHub Actions runs checks, Python tests, builds, image construction and container acceptance. It never publishes. Wait for checks on the latest commit, record full review and resolve findings. Exact results belong in issue/PR. Automated Chromium is not testing every physical phone/browser; verify target compatibility when changing it.

Mobile-comfort tests exercise long-list/board/agenda continuity after complete/reopen, slow/failed reads, filters/recurrence and field dimensions at 320/375 px in both themes. Simulated visualViewport shrinking covers quick-add, description/dialog, native moves, manual scrolling and intentional zoom. This tests integration, not real iPhone keyboard/automatic zoom. Desktop focus/sizes are checked.

Settings scenarios create three sections through API, checking later name/description/add fields and delayed native scroll after keyboard resizing, field visibility below headers, user-scroll priority, resumed typing/draft retention and saved API values. WebKit can rerun the suite; it still does not replace a physical iPhone.

Duplication/bulk tests cover independent history, early-completed recurrence, open/completed types, cross-workspace labels, order, archives/restore, authorization/CSRF and complete rollback on conflict/invalid calendar. Task-actions tests use real pointer/touch events for menus, rectangle, long hold/scroll, bulk/conflicts and mobile themes.

## Applications and library {#applications-et-bibliotheque}

Architecture tests validate folder contracts, unique IDs/routes, frontend/backend manifest parity and import boundaries. Application tests cover defaults/idempotence/owner/CSRF/strict booleans/SQL/migration and retained data. They enumerate every business route to prove disabled denial.

Applications browser tests cover Home login, keyboard activation, persistence, empty Home, disabled direct access, reactivation with task/history, common theme, 320 px, network errors, external activation on foreground and expiry. Existing Tasks flows remain. Container restoration compares activation values; per-file phases reset only disposable login counters.

## Sport {#sport}

HTTP tests cover 680 exercises/ten types, measure validation, ownership/CSRF, snapshots/versions, set/rest lifecycle, comparable scores, measurements/archives, disabled routes, SQL constraints and upgrade/downgrade loss refusal. Browser tests cover API/UI parity, mobile/keyboard/errors/statistics/resume. Restore compares all five tables.

Suggestion tests cover ten types, different set values, corrections, partial cancellation, undo, empty session, old snapshots, owner/program isolation, reordering/duplicates/types. Browser flows preserve neighboring drafts, real conflict/refresh, correction without restarting rest, ignored stale reads and rest across tabs. Measurements at 320/375/1440 px include touch/keyboard simulation, both themes and access to last controls.

Set cards for all types are measured for long titles, aligned fields/buttons, touch targets, compact height, saved/draft states and keyboard corrections verified through API/reload. HYROX tests cover strict ISO/leap/null/omitted/past dates, session snapshots, versions/CSRF/ownership/archive/disable, migration round trip and refusal for dates in either table. Browser tests verify immediate branding/date, list/editor/catalogue/session, 320/1440 px/themes/keyboard/errors/reload, midnight/DST/event-day/past dates and contrast/overflow. Restore compares competition dates too.

Program cards are measured at 320/375/1440 px, FR/EN/light/dark: compact mobile preview, equal HYROX/classic dimensions, aligned actions, 44 px targets, keyboard editing/start. Archives use the editor, protect drafts, recover from network/conflicts and retain exercises/notes/date through API. Captures use supplied catalogue exercises to avoid personal-name collisions in later suites.

## French and English {#francais-et-anglais}

HTTP tests cover fr/en preference/schema, sessions/CSRF/ownership, negotiation/concurrency, catalogue key/parameter parity, all 680 IDs, personal same-name exercises, unchanged snapshots/scores, activation and locale migration. English scheduling covers numbers/dates/cadences/bounds/exclusions/Unicode/diagnostics/literals/help.

I18n browser tests verify anonymous/account language, relogin/theme, English Tasks, localized catalogue/personal data, programs/training/history, stale responses, drafts, mobile/keyboard/errors/expiry. Restore compares saved English preference.

Navigation tests compare shared topbar/sidebar/links/footer across apps at 1440/1000/800/375/320 px, themes and FR/EN, API preferences, focused documentation links, library/logout, focus confinement/Escape/backdrop and mobile-desktop transitions.

## Background Tasks interactions {#interactions-taches-en-arriere-plan}

Task-sync tests deliberately hold write responses: multiple actions must render before release, then match API values/versions. Cover conflicts/errors/drafts, actions before creation receives a server ID, agenda/settings/mobile/keyboard/reduced motion. Existing tests wait for confirmed save before persistence assertions; optimistic rendering alone is insufficient evidence.

No schema/API/recurrence/history changes accompany synchronization. Existing ownership/CSRF/backup/disable tests remain. Task-drag-input covers repeated Enter creation and focus with delayed writes, date errors, title/body dragging, empty sections/cells, cross-workspace drops, API dates/history, off-target drops/Escape/errors. Rectangle selection starts from background; touch scroll/long-hold tests remain.

## Tracking and cross-app metrics {#suivi-et-metriques-inter-applications}

Integration tests cover local/DST windows, net task completions/undo/manual reschedule/owner filters/disabled sources, Sport aggregations and missing observations. Tracking tests cover periods/strict types/scores/XP/versions/dated definitions/snapshots/archive/reenable/errors/SQL protections. Architecture validates optional providers/shared frame; activation tests enumerate the entire router.

Tracking browser tests cover real API/UI empty/error states, zero/No/corrections, keyboard calendar at 320/390/1440 px, month/year, sources/settings/archive/restore/English/dark. Restore compares all five tables; captures use synthetic data only.

Progression tests cover scales/levels/quests, concurrency/owners/calendars/DST/vacations/backfill, immutable journals and loss refusal, plus provider contracts. Browser flows cover live badge, keyboard panel, wall/filter/settings/draft/error/expiry and FR/EN/themes/320 px. Container acceptance imports twice idempotently, compares four tables and immutable rewards. Old-migration fixtures disable new attribution to isolate old invariants; 0010 tests use real rewards.

## OKR Goals {#objectifs-okr}

HTTP tests cover progressive detail, parents, month boundaries/leap dates, rising/falling results, order/concurrency, quarter closure timezone, snapshots/reopen/unique rewards, owner/activation/archives/SQL/migration/loss refusal. Common tests cover routes/manifests/providers/translations/quests. Browser tests cover guided API/UI flow, board/retrospective/Tracking, drafts/errors/mobile/keyboard. Shared navigation includes OKR. Restore compares three tables and immutable events. Publication tests use an isolated account.

## Recipes and shopping {#recettes-et-courses}

HTTP tests cover bilingual/private ingredients, decimals/servings/unit combination, partial purchases, templates/copies/archive/conflicts/metrics/XP/SQL/migration guard. Browser flows cover UI/API, network failures, drafts, desktop/mobile shopping. Shared navigation covers language/theme parity. Restore compares six tables/immutable journal; smoke covers public routes, private API rejection, guides and OpenAPI.

## Documentation and screenshots {#documentation-et-captures}

Every French page has an English counterpart and belongs to one guide. Strict builds validate links; guide hooks reject uncategorized/untranslated pages. Browser acceptance checks scoped navigation/search, translated chrome, language-equivalent links, local screenshots, mobile/keyboard and historical URLs.

Run `scripts/capture-documentation.sh` to regenerate screenshots. It builds the app, creates disposable PostgreSQL and two demo accounts, starts a loopback test server, captures both languages and removes its own server/container. Playwright Chromium and its system dependencies must already be installed. Never point this fixture at production. The Node capture script accepts only an explicit loopback URL and dedicated documentation accounts; its seed state is temporary. Screenshots are versioned in docs/assets/screenshots/fr and en and contain no real account data. Review them visually and add localized alternative text/captions when updating guides. Swagger’s technical controls remain English in both captures.


## Sport UX (issue 74) {#finition-sport-issue-74}

`test_sport_ux.py` covers partial/versioned preferences, isolation/preservation, complete facets, copies, frozen preparation/context, history navigation, statistical baselines, actual completion XP, UTC calendar and migration 0014 loss protection. `sport-ux.spec.ts` covers views by format, debounced requests, lists under latency, navigation continuity, drafts, pending-write closure, conflict comparison/copies, selection across pages, direct reorder, set focus and normalized drafts, adjustable rest and summary, collapsed measurements, neutral differences and chronological charts with keyboard access. Tests use the real API; delay/error injection is confined to specified scenarios. Shared navigation checks mobile controls remain hidden on desktop regardless of CSS loading order.

Sport chart geometry checks explicitly wait for the points to render after navigation. Reading the SVG list immediately can precede the API response over HTTPS even when the chart loads correctly.

### Sport score v2 {#score-sport-v2}

`test_sport_scores.py` covers all ten types from the first empty/partial session, weight/assistance/distance/duration effort, volume and capped pace, partial targets, frozen/unknown references, duplicates, extreme values and owner/CSRF/idempotent repair preserving dates/results/rewards. Existing Sport tests check new scores and suggestions. Browser acceptance verifies FR/EN and desktop/320 px score, completion, difficulty, references and zero chart points, including an entirely omitted exercise. Container restoration retains full metrics JSONB.

### Sport mobile density

`sport-mobile.spec.ts` measures initial content at 320 × 568, 390 × 664 and 430 × 780 in French/light and English/dark: at least two complete rows on the smallest phone and three on larger formats, search/filter access, list/grid switching, the first plot, first exercise inputs, first sets and visible settings input. It verifies a picker that does not summon the keyboard on opening, focus restoration, copy/archive/undo and positioning actions, complete measurement details after compact previews, preserved collapsed values and saving with a 360 px reduced viewport. Touch landscape at 844 × 390 keeps mobile preferences.

Existing Sport scenarios explicitly open compact menus and options while retaining persistence, conflict, validation and preservation assertions. Shared navigation/settings tests cover the other applications. Screenshots finish animations before capture; browser emulation does not constitute physical-device testing.

## AI assistant

The `test_assistant*.py` suites cover private routes, memory and history, atomic receipts, confirmations and adapters for all five applications. Contract tests compare capabilities against HTTP routes; domain tests verify ownership, versions, archives, history and that adapters do not commit. The `lifeos` specialist also exposes shared library, preferences, progression and integration operations.

`test_assistant_memory.py` checks explicit FR/EN refusals, sensitivity guards independent of the model flag and stopping after automatic correction. `test_assistant_compaction.py` checks complete-message batches, split oversized messages, the last message actually covered and preservation after interruption.

`test_assistant_migration.py` checks business data preservation through migration 0015, SQL constraints, the three idempotence keys and downgrade refusal for each of the seven populated tables. `test_assistant_key_rotation.py` checks rotation/dry-run, wrong-key failure without loss and restoration: interrupted replies, invalidated previews, preserved completed receipts and memories, and revoked sessions. Container tests compare all seven tables after dump/restore and decrypt a strictly synthetic token.

`test_assistant_providers.py` uses simulated HTTP responses for OpenAI, Anthropic and Gemini. These suites never contact a real provider and do not prove account access, model availability or real-request behavior. Real-provider validation is separate and must be recorded explicitly; never infer it from passing simulated tests. The `assistant.spec.ts` journeys exercise the interface with synthetic data. Results of commands actually executed belong in the delivery issue and pull request.

## Multimodal source validation

`test_assistant_documents.py`, `test_assistant_web_sources.py` and `test_assistant_sources.py` exercise real synthetic formats, active archives/PDFs, signatures, process bounds, quotas/concurrency, owner/CSRF, session expiration, IPv4/IPv6 URLs, mixed DNS/redirects/rebinding, TLS and safe downloads. `test_assistant_multimodal_runtime.py` covers all three provider formats, older references, budgets, replay after removal, direct-text separation, server confirmations and disabled automatic memory. `test_assistant_transcription.py` covers native OpenAI/Gemini contracts, admission, errors, revalidation, independent settings and no audio persistence.

Migration and atomic credential rotation run on real PostgreSQL. Container acceptance imports files through HTTP, dumps and compares sources/credentials after restoration, removing only unfinished reservations and leases. Browser tests simulate microphone/providers to verify permissions, stop/cancel, stale responses, draft insertion, retry, source-only messages, reload, errors and languages/themes/mobile. These doubles do not prove access to a real provider account or physical-phone behavior; those checks remain separate and are recorded in the issue.

## Dashboard and Life AI

`test_life_ai.py` covers shared configuration without Life AI, ownership/CSRF, table/preference preservation, migrated activation and new-account defaults. Architecture and HTTP tests inspect effective nested-router operations. Chat/import/dictation scenarios disable Life AI during an external call and check that no further private response or mutation bypasses the guard. `dashboard.spec.ts` covers FR/EN, three themes, desktop/320 px, keyboard, single submission, legacy links, no private URL/storage text, missing configuration, edited drafts, browser back and private-data unmounting. Chat and shared-navigation suites continue on `/ai`.
