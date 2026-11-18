# Deployment

## AI assistant delivery

After validation, review, CI and merge, publish clean `main` using `scripts/deploy.sh`. Backup precedes additive migration `0015_assistant`. Configure `LIFE_ASSISTANT_ENCRYPTION_KEYS` in protected `.env.production` and back up this keyring independently before saving provider tokens. `LIFE_ASSISTANT_TIMEOUT_SECONDS` defaults to 180 seconds. HTTP/encryption dependencies join the existing image; no new service, volume, DNS or proxy is introduced. Verify outbound HTTPS to all three providers and progressive streaming through Caddy.

Users configure provider, model and token in settings; never invent credentials, place them in versioned files or expose them in logs. Without real credentials, verify the interface and configuration errors and explicitly record that live provider access was not validated. Fake-provider tests do not prove access to a provider account.

On a synthetic account, check FR/EN Home/history, token save/masking/removal, sourced memory then correction/forgetting/disable, reads and writes in every application, preview/confirmation/conflict, conversation archive/restore, interruption and reload without duplicated writes. Check mid-turn application disablement and session expiry, direct applications, themes, keyboard, reduced motion and 320 px mobile. Test [restoration and rotation](sauvegardes.md#migration-0015-assistant) on a disposable database.

Compare the running image SHA and Alembic revision; verify probes, `/`, `/settings`, `/applications`, all five application routes, OpenAPI, `/documentation/assistant/`, `/documentation/en/assistant/` and both API references over HTTPS. Record backup, SHA, revision and results in issue #85; never report an unexecuted check as successful.

## Principle {#principe}

VPS deployment completes every change, including documentation and AGENTS.md. After review, successful CI and merge, publish the latest validated main without waiting for another deployment request. Verify the running version/public routes and record results in the issue. Report production blockers explicitly; merging alone is not delivery.

Life runs on a Hostinger VPS with existing Docker/Caddy. Dedicated Compose project life joins external multisite_proxy without opening another host port.

The script builds from a clean commit, starts PostgreSQL, backs up, explicitly migrates and starts web. It retains the prior image reference; returning to that image does not restore data. DNS/Caddy are one-time setup; routine releases change only Life.

## Server prerequisites {#prerequis-sur-le-serveur}

- Repository/working-directory access.
- Docker Engine, Compose v2 and Docker permissions.
- Existing multisite_proxy reachable from the installed Caddy.
- Operator access to read/reload Caddy configuration.
- Hostinger DNS access for the first publication.

```bash
docker version
docker compose version
docker network inspect multisite_proxy
git remote -v
git status --short
```

Do not recreate a same-name network without understanding its use. Caddy must reach Life on the same Docker network.

## 1. Prepare the release {#1-preparer-la-version}

Fetch the intended commit, install dependencies and validate:

```bash
make install
make check
make test
make build
git status --short
git rev-parse HEAD
```

The working tree must be clean. Commit application files, including relevant untracked files, before release. Ignored development/operations files are not part of the commit.

## 2. Configure and start Life {#2-configurer-et-demarrer-life}

At first activation:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Replace placeholders with distinct random PostgreSQL secrets. The app password must match LIFE_POSTGRES_PASSWORD and LIFE_DATABASE_URL; role life, host db, database life. Never use the admin password for the application. See [Configuration](configuration.md). Never commit secrets.

```bash
./scripts/deploy.sh
```

Under a local lock, the script:

1. Builds local/life:<full SHA> from the clean checkout.
2. Starts private PostgreSQL and waits at most 120 seconds.
3. Creates a protected backups/ dump, including first installation.
4. Runs life migrate in a one-off container using the new image.
5. Recreates web and waits at most 90 seconds for readiness.
6. Saves current-image and, where applicable, previous-image references after success.

Failure stops processing, shows relevant logs and preserves data/backups. It never automatically downgrades the database or blindly runs an old image after migration. Diagnose and follow [recovery](sauvegardes.md). Future migrations must state whether old code can write during execution; incompatible changes need a maintenance window.

Create the personal account without a password argument:

```bash
export LIFE_IMAGE=$(cat .deployment/current-image)
docker compose --env-file .env.production exec web life create-user thibault
```

The CLI prompts for a password of at least 12 characters and confirmation. Migrations create no default account. Verify login and task create/complete/reopen.

postgres_data persists independently of image. PostgreSQL has no host port; web uses life-web on the proxy network. Never use down --volumes for deployment/rollback.

```bash
docker compose --env-file .env.production ps
```

Retain prior image/backups until validation. CI tests images but does not deploy; merging performs none of these operations.

## 3. Integrate Caddy {#3-integrer-caddy}

Integrate infrastructure/caddy/life.caddy into the existing configuration:

```caddyfile
life.thibault-leveau.com {
    import common
    reverse_proxy life-web:8000
}
```

The common snippet belongs to the existing Caddy setup. Verify it; never replace the complete proxy configuration with this block.

Back up the active configuration with a timestamp, add only Life, validate the full configuration and reload without stopping other sites. For containerized Caddy, replace placeholders:

```bash
docker exec <conteneur-caddy> caddy validate   --config <chemin-Caddyfile-dans-le-conteneur> --adapter caddyfile

docker exec <conteneur-caddy> caddy reload   --config <chemin-Caddyfile-dans-le-conteneur> --adapter caddyfile
```

Configuration validation does not prove upstream reachability. Confirm Caddy resolves life-web and receives a response on port 8000.

## 4. Configure Hostinger DNS {#4-declarer-le-dns-chez-hostinger}

Read the current zone and latest snapshot first. Check A/AAAA/CNAME records for life to avoid conflicts. Create/adjust only the necessary record:

| Type | Name | Target | TTL |
| --- | --- | --- | --- |
| A | life | 168.231.82.6 | 300 seconds |

Preserve other records, especially MX/TXT/verification. No nameserver change or new hosting purchase is required. Check inconsistent AAAA records that could misroute IPv6; do not add IPv6 without verifying address/VPS access.

## 5. Verify HTTPS and publication {#5-verifier-https-et-la-publication}

Caddy manages the certificate. Public DNS and HTTP/HTTPS reachability are required.

```bash
dig +short A life.thibault-leveau.com
dig +short AAAA life.thibault-leveau.com
curl --head http://life.thibault-leveau.com/
curl --head https://life.thibault-leveau.com/
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Without dig, use an available DNS resolver/zone view. Propagation depends on caches; TTL 300 does not forcibly expire old answers.

In a browser check Home, sign-in, task views, theme/history, documentation and local assets. If proxy configuration changed, verify existing Caddy-hosted sites still respond.

## Subsequent releases {#livraisons-suivantes}

1. Prepare/test/review, await latest-commit CI, merge, and return to clean current main.
2. Run scripts/deploy.sh on the VPS.
3. Run public smoke checks and inspect logs.
4. Retain the prior image during validation.
5. Compare actual running image SHA to published main, verify affected flows and record results in the issue.

DNS/Caddy stay unchanged while domain/network/alias remain stable. GitHub Actions validates commits but never automatically publishes.

For recurrence, apply packaged 0004_recurrence after backup; preserve old dates/history and observe [rollback constraints](sauvegardes.md#migration-0004-recurrences). Verify authenticated parse/preview, calendar and natural-language scheduling over HTTPS on an isolated account.

Extended French grammar uses the same revision, environment and services. Verify written-number compositions, next dates and incomplete-input diagnostics in title/planner, without changing personal tasks/events.

## Return to the previous image {#retour-a-la-version-precedente}

```bash
./scripts/deploy.sh --rollback
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Rollback uses previous-image without rebuilding. The image must exist and recognize the exact Alembic revision; the script tests compatibility first. It changes no database, Git, DNS or Caddy state.

A changed schema requires forward correction or compatible dump/image restore; image rollback alone cannot undo it. Pre-PostgreSQL code lacks this probe and needs its own documented configuration, preserving current backup/volume.

Compose configuration comes from the current checkout. If incompatible, prepare/review the target-version checkout first. Do not remove volumes or alter unrelated VPS services to force rollback. Also read JSON compatibility restrictions below: equal Alembic revision alone is insufficient.

Menus/multiselection use the existing 0004 schema, environment/services and backup. Verify duplicate/bulk routes, contextual menu, mouse rectangle/mobile hold, reversible deletion and retained history on an isolated account.

## LifeOS library release {#livraison-de-la-bibliotheque-lifeos}

Apply 0005_applications after backup. Application reorganization preserves old business routes/tables; activation adds a table. Old images ignore activation and reject the revision. See [recovery](sauvegardes.md#migration-0005-applications).

Verify running SHA, both probes, Home/library/Tasks/OpenAPI/documentation over HTTPS. On a synthetic account check common login, enabled Home, disabling, empty Home, API/direct access rejection, preserved history after re-enable, theme/mobile. Personal data must remain unchanged. Record SHA/backup/results.

### Sport release {#livraison-sport}

Apply additive 0006_sport after backup; no new service/secret. Verify Sport, guide/API guide, OpenAPI/probes. Sport defaults disabled. On a test account activate, search catalogue, create program, confirm set/rest, reload, finish, record measurement, view score/statistics and disable/re-enable with data retained. Record actual SHA/results.

### Sport program pages {#pages-de-programmes-sport}

Program naming/editor pages keep 0006 and existing API/tables. Back up normally; no new migration/settings. Verify new/edit program URLs, create/edit/back/tabs/errors on mobile/desktop and preserved programs/training. Previous image remains data-compatible.

### Direct set input and suggestions {#saisie-directe-et-reprise-des-series-sport}

No new SQL migration/service/secret; suggestions live in JSONB and require [image compatibility review](sauvegardes.md#propositions-de-series-sport), not just Alembic checks.

On a test account enter two sets with different weights/reps, correct/undo, scroll with fixed counter, finish and restart. Verify persisted suggestions without preconfirmed sets, mobile/themes/keyboard, last controls and conflicts. Check running SHA, probes, HTTPS/OpenAPI/docs and record backup/results.

### HYROX branding {#branding-hyrox-sport}

After backup apply additive 0007_hyrox; see [compatibility](sauvegardes.md#migration-0007-hyrox). Existing programs/sessions receive null dates unchanged.

Create a hyrox-named program, select competition date, add exercise, save/start. Verify logo/countdown in cards/editor/catalogue/session, mobile/light/dark, reload persistence and session-date independence after program edits. Check SHA/probes/public routes and record backup/revision/results.

## French/English release {#livraison-francaisanglais}

Publish validated main with backup and additive 0008_locale. No new variable/secret/database/service. Existing accounts remain French and content unchanged. Downgrade refuses losing English preferences; see [compatibility](sauvegardes.md#migration-0008-langue-du-compte).

On the isolated account verify language selector/persistence/theme independence, Tasks/Sport, translated supplied names and intact personal text. Verify English directory/Tasks/Sport guide URLs and public probes. Record results/SHA.

## Tracking and integrations release {#livraison-suivi-et-integrations}

Publish after backup with additive 0009_tracking; no service/secret/environment/Caddy/DNS change. See [restore](sauvegardes.md#migration-0009-suivi).

Verify SHA/revision/probes, Tracking, both-language guides, API/discovery over HTTPS. Test activation, daily tracker, zero/No entry/correction, 0/10 then 10/10, Tasks/Sport filter, stored snapshot after source disable, mobile/desktop calendar, archive/restore and disable/re-enable. Check shared navigation. Record backup/revision/SHA/results without using personal data.

### Finish incomplete Sport sessions {#fin-de-seance-sport-incomplete}

Publish with backup, no new SQL migration or environment (0008_locale at delivery). Zero values/skipped markers require [JSON compatibility](sauvegardes.md#fin-de-seance-sport-incomplete).

On synthetic sessions confirm one set then finish: verify FR/EN confirmation, draft retention, remaining zeroes in history, preserved dates, stopped rest and performed-set count. Reload/restart: zeroes must not replace prior suggestions. Finish another with no performed set and verify scores, mobile 320 px/keyboard. Check actual SHA/probes/Sport/OpenAPI/guides and record results.

## Progression release {#livraison-de-la-progression}

After checks/review/latest CI/merge, publish main with backup then additive 0010_progression. No new service/secret/DNS/Caddy. New first confirmations award immediately; historical points require explicit named-account backfill.

After the new image is healthy and old web stopped, preview/import only the **named account** using the published image/configuration:

```bash
export LIFE_IMAGE=$(cat .deployment/current-image)
docker compose --env-file .env.production run --rm --no-deps web \
  life backfill-progression thibault --dry-run
# After reviewing the scope and preview, import this account only.
docker compose --env-file .env.production run --rm --no-deps web \
  life backfill-progression thibault
```

Use an explicitly intended account; never automatically backfill all users. Preview prints activity/base-XP counts per app; quest bonuses evaluate on write. Each account locks for its transaction; concurrent actions then find deduplicated keys. Failure rolls back the account, successful repeats add nothing. Record only account/scope/aggregate results without private business content.

Verify SHA/probes/apps/OpenAPI/FR/EN guides/progression over HTTPS. Test first confirmation/reopen without double XP, performed-set session versus cancellation, tracker correction, quests/levels/titles/streaks, badge/nearby quests, filters/journal, weekends/vacations, keyboard/Escape, 320 px, themes/languages, preserved reactivation and Tasks/Sport independence from Tracking. Record backup/revision/SHA/results. See [rollback limits](sauvegardes.md#migration-0010-progression).

## OKR release {#livraison-objectifs-okr}

Publish after checks/review/CI/merge, backing up before additive 0011_okr. No new infrastructure/secret/dependency; defaults disabled. Providers use existing registry. See [compatibility](sauvegardes.md#migration-0011-okr).

Verify SHA/revision/probes/OKR/FR/EN guides/API/OpenAPI. Synthetic flows: four linked horizons, one-month quarterly plan, result progress, board/order, complete/reopen without duplicate XP, retrospective, Tracking metric, 60 quests, archive/restore, disable/re-enable, languages/themes/mobile/keyboard. Record backup/SHA/results; merge alone is insufficient.

## Per-app usage days release {#livraison-des-jours-dutilisation-par-application}

Publish with normal backup, same 0011 revision and no new service/secret/dependency. Existing settings persist. New JSON requires [older-image compatibility](sauvegardes.md#calendriers-de-progression-par-application).

Test Sunday-only Tracking, Monday/Wednesday/Friday Sport and weekdays Tasks on a synthetic account. Save/reload and compare settings API/resolved days/pause, vacations/badge reminder, keyboard/draft, languages/themes/320 px, disable/re-enable with preferences/rewards retained. Check actual SHA/probes/OpenAPI/guides; record backup/results without changing personal calendars.

## Recipes and shopping release {#livraison-recettes-et-courses}

Publish validated/reviewed/merged main, backup then additive 0012_recipes including 301 FR/EN ingredients. No extra service/secret/dependency/DNS/Caddy. See [image compatibility](sauvegardes.md#migration-0012-recettes-et-courses).

Verify SHA/revision/probes/Recipes/guides/API/OpenAPI. Synthetic flows: activate, bilingual search/private ingredient, recipe for two scaled to six, import/combine, partial purchase/addition, completed list/template, fresh copy, 60 quests/Tracking metrics, archive/restore/disable/re-enable, keyboard/320 px/themes/languages/draft protection. Record backup/revision/SHA/results.

### Additional recipe units {#unites-supplementaires-des-recettes}

Publish with backup then 0013_recipe_units, no new dependency/environment/infrastructure. Old g/l/u writes remain compatible during migration; review [rollback](sauvegardes.md#migration-0013-unites-des-recettes).

Test ml/mg/tsp/tbsp entry, reload, serving scale, list import/combination, purchase/template copy, FR/EN/keyboard/320 px and separation of different units. Verify actual SHA/probes/Recipes/OpenAPI/guides; record backup/revision/results.

## Tasks ergonomics release {#livraison-ergonomie-taches}

Publish validated main with the usual backup. No new service/secret/SQL migration; respect [agenda JSON compatibility](sauvegardes.md#filtres-dagenda-et-actions-groupees-taches). On a synthetic account verify multi-workspace search with completed/archives, previous/next, drafts, selection menu, bulk priority/status/labels, recurrence/completion and restore. Check 320 px focus, languages/themes/reduced motion, probes/OpenAPI/FR/EN guides and running SHA. Record backup/commit/results.

## Separate documentation release {#livraison-documentations-separees}

Publish the validated main using the same backup/build/migration/deployment script. No data migration, service or environment setting is added. Verify both directories, all seven guide entries in both languages, language-equivalent links, guide-scoped menus/search, local screenshots and existing application help links. Check mobile/keyboard navigation, actual image SHA and public probes. Record the deployed commit, backup and verification in the issue.

## Deploying general settings

Publish validated main through `scripts/deploy.sh` with its normal backup. No SQL migration, dependency, environment variable or Caddy/DNS change. Verify running SHA, probes, `/settings`, `/settings?application=sport`, legacy `?tab=settings` links, OpenAPI and both settings guides over HTTPS. On an isolated synthetic account, verify the account-name menu, each section/API save, drafts, expiry, disable/reactivate, languages/themes and 320 px. Record backup, SHA and evidence in issue #76.


## Sport UX release {#livraison-de-la-finition-sport}

Publish validated main using `scripts/deploy.sh`, with backup before additive migration `0014_sport_ux`. No additional service, secret or dependency. View preferences, explicit context and frozen notes require the [rollback constraints](sauvegardes.md#migration-0014-finition-sport); older images reject this revision.

On an isolated synthetic account, verify list/grid per format, search/return, program copy, exercise selection, set entry/resume, rest ±15 seconds, completion summary, history, measurements/charts and presets at `/settings?application=sport`. Check drafts/conflicts, language/theme and 320 px; disable/re-enable Sport and verify preservation. Compare running SHA, revision, probes, public HTTPS Sport/settings and FR/EN guides. Record backup, SHA and results in issue #74 without using personal data.

## Deploying Sport score v2 {#livraison-du-score-sport-v2}

After checks, self-review, CI and merge, publish with `scripts/deploy.sh` and its normal backup. No new SQL migration, dependency or variable (`0013_recipe_units`). Respect [image compatibility](sauvegardes.md#score-sport-v2). For the affected account, run `POST /api/v1/sport/scores/backfill` after deployment, record the repaired count and confirm a second call returns zero. This targeted repair must not modify other accounts.

On a synthetic account, verify first partial session, entirely omitted exercise, empty session (0), relative difficulty for weight/distance/pace, references, history/statistics, FR/EN, 320 px and keyboard. Check API `score_details`, frozen references, next-session suggestions and preserved results. Verify actual SHA, probes, OpenAPI, `/sport` and FR/EN guides over HTTPS; record backup, repair and results in the issue.
