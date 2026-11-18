# Backups, migrations and restoration

## Migration 0015: assistant {#migration-0015-assistant}

`0015_assistant` adds seven `assistant_*` tables without rewriting application data. Dumps preserve settings, encrypted tokens, conversations, messages, summaries, memory sources, runs, events and receipts. `LIFE_ASSISTANT_ENCRYPTION_KEYS` stays outside the dump and image: keep an independently protected copy associated with backup and commit references. Conversation and memory text do not use the encryption reserved for tokens; protect dumps like other private data.

The restore suffix marks `running` runs/messages as `interrupted`, invalidates `preview` proposals as `failed`, then revokes all restored sessions. `complete` receipts remain unchanged. Old runs/proposals must never resume writes after restoration; inspect receipts and make a new request if needed. Restoring an old dump can reintroduce conversations, memories or credentials deleted since: disclose this during recovery, repeat necessary forgetting and replace affected tokens. Forgetting in Life does not purge historical backups or copies already sent to the provider.

On a restored copy, use the matching historical key, test decryption with synthetic credentials, compare memories/messages/receipts, and verify no active runs and no restored login sessions remain. A lost key cannot be reconstructed from the dump: enter a new token in settings. Application, conversation and memory recovery remain possible. Checking dump format alone does not prove these properties.

Previous images do not recognize `0015_assistant`. Downgrade refuses if any new table contains data, including settings; never delete records to bypass this guard. Prefer a forward fix or explicit restoration of a compatible dump/image with its keys.

### Encryption rotation

Generate a new Fernet key in a private terminal. Set the protected keyring to `new,old`: the first encrypts and the others allow decryption. Keep an independent backup of the new keyring. Using the published image, inspect and re-encrypt the explicitly selected account:

```bash
export LIFE_IMAGE=$(cat .deployment/current-image)
docker compose --env-file .env.production run --rm --no-deps web \
  life rotate-assistant-key thibault --dry-run
docker compose --env-file .env.production run --rm --no-deps web \
  life rotate-assistant-key thibault
docker compose --env-file .env.production up -d --no-build --wait web
```

The command locks the account, validates its user/provider envelope and re-encrypts within one transaction. Dry-run changes nothing; failure preserves ciphertext. It prints neither token nor key and calls no provider. Verify decryption with the new key alone on an isolated copy before removing the old active key. Retain older keys in protected archives as long as matching backups must remain restorable. This rotation neither replaces nor revokes the provider's token.

## Back up {#sauvegarder}

From the server repository root, with `.env.production` configured and PostgreSQL running:

```bash
./scripts/backup.sh
```

The script uses PostgreSQL custom-format pg_dump without owners/ACLs. Dumps remain consistent during writes. It writes a protected temporary file, checks pg_restore --list, then renames to backups/life-<UTC date>-<pid>.dump. Directory permissions are 700, file 600. Errors never publish partial backups.

Retain image SHA, Alembic revision and date with the dump. Neither environment secrets nor Docker image are included. A volume is not a backup; a same-VPS copy does not protect against losing the server. Regularly copy dumps to separate encrypted storage accessible only to the operator.

Deployment backs up before every migration, including an empty first-install dump. No schedule/purge is installed. For routine use plan daily and pre-operation backups, choose retention based on acceptable loss and regularly verify restores.

## Test restoration without touching Life {#tester-une-restauration-sans-toucher-a-life}

`make test-container` creates life_restored inside disposable PostgreSQL. It generates SQL without owners/ACLs and restores using `psql --single-transaction --set ON_ERROR_STOP=1`, matching operations. Tests cover agenda preferences, events, removing objects absent from dumps, session revocation, complete rollback on errors, migration and immutable triggers. No real data is used.

For real backups, prepare **separate** PostgreSQL of the same major version, with life owning an empty database. Restore a trusted copy and verify accounts/workspaces/tasks/dates/events/constraints without publishing contents. pg_restore --list checks format, not a complete restore.

## Restore production {#restaurer-la-production}

This replaces current data and makes Life unavailable. Identify dump/commit/revision first. Changes after the backup are absent from the restored database; the script first backs up current state for recovery.

```bash
./scripts/restore.sh --confirm-data-replacement backups/life-DATE-PID.dump
```

The script shares deployment’s lock, validates dump format, backs up current data, stops only Life web, then replaces the entire application public schema in one transaction. Objects added after the backup are removed too. Protected temporary SQL is deleted. Restored login sessions are revoked to avoid reactivating old cookies. Failure stops processing and leaves Life stopped; investigate before restarting.

After restore:

1. Select an image compatible with the restored revision.
2. If upgrading, read the migration and explicitly run life migrate.
3. Restart web and verify readiness/public smoke tests.
4. Sign in again, compare sample data/history and record the incident.

With a known compatible image:

```bash
export LIFE_IMAGE=local/life:SHA_COMPLET_VERIFIE
docker compose --env-file .env.production up -d --no-build --wait web
./scripts/smoke-test.sh https://life.thibault-leveau.com
```

Never use `docker compose down --volumes` for restoration. Retain volume and emergency dump until recovery is validated.

## Migrations {#migrations}

```bash
uv run life migrate
# In production, with LIFE_IMAGE set:
docker compose --env-file .env.production run --rm --no-deps web life migrate
```

Alembic upgrades to head. Migrations ship in the image, run explicitly and never execute independently in each worker. Initial migration creates schema/journal protection but no account.

The initial downgrade exists for tests and **drops all business tables**; it is not a production recovery procedure. Test future changes on a copy and document compatibility. Prefer forward fixes or known-dump restores.

0003_agenda adds preferences without changing tasks/events/accounts. Old code can write existing tables during the additive migration, but its probe rejects the new revision; finish with the new image after the usual backup. Upgrade/downgrade tests retain existing tasks/dates/completions; downgrade removes only preferences and re-upgrade restores defaults, losing settings. It is not automatic rollback. Verify custom period/options after restoration too.

Image rollback restores no data. `deploy.sh --rollback` requires the image to recognize exactly the current Alembic revision. Returning to pre-PostgreSQL architecture needs a version-specific procedure while preserving dump/volume.

## Migration 0002: workspace parents {#migration-0002-parents-des-espaces}

0002 adds only nullable parent_id, index and constraints. Existing workspaces become roots; tasks/completions/events/archives survive. Back up normally; no new secrets/volume/settings.

Old writes omit parent and remain compatible during addition. DDL briefly locks tables; old readiness detects revision mismatch until the new image runs, so uninterrupted service is not guaranteed. Once hierarchy exists, do not reuse code ignoring archive rules; automatic rollback refuses unknown revision.

Downgrade to 0001, reserved for tests/prepared offline intervention, retains tasks/workspaces but **deletes all parent links**. Re-upgrade leaves roots. Prefer forward correction; full recovery requires matching dump/image. Dumps include parent constraints; isolated restore compares space/parent pairs, events and revoked sessions. On a real copy verify tree, archived children, navigation, cycle/foreign-owner rejection without exposing data.

## Migration 0004: recurrences {#migration-0004-recurrences}

0004_recurrence adds nullable task recurrence JSONB, zero-default completion count, two constraints and rescheduled/completion_undone event kinds. Existing text/dates/events are unchanged. Old writes remain compatible during additive publication, but readiness rejects the new revision; finish deployment before using recurrence. DDL briefly locks; no extra service/environment.

Back up through deploy.sh. Verify parsing/preview/create/complete on isolated synthetic data; old dates/status/history stay intact. Downgrade is possible only without recurrence or new event types; once used it refuses loss. Do not delete data/events to bypass it. Prefer forward fix or matching earlier dump/image.

Dumps contain complete rules, anchors/timezones/exceptions/count/current dates/events. Container restore compares these with immutable history/preferences. On a separate real-backup copy verify next calculated date and ended series; never test on active data.

## Migration 0005: applications {#migration-0005-applications}

0005_applications adds preferences/constraints without rewriting existing data. Tasks defaults enabled, preserving existing access. No new environment/secrets/database/service. Old code may write its own tables during migration but rejects the new revision and ignores activation: finish with new code before using the library.

After backup, verify schema/catalogue, disabled 403 and identical tasks/events after re-enable on an isolated account. Empty-preference downgrade is safe; any preference causes refusal. Never delete preferences to force production rollback; use forward fix or known compatible dump/image.

Container acceptance disables Tasks through the API before backup, then compares owner/ID/boolean/time including disabled state; restored sessions stay revoked. Existing recurrence/event/preference/transaction tests remain. Pre-0005 dumps have no personal activations and use defaults after migration.

## Migration 0006 Sport {#migration-0006-sport}

Adds five sport tables, constraints/indexes only. Existing Tasks writes remain compatible during addition, but old probes require the old revision. Deploy new code; no extra environment/role/volume/service.

Full dumps include personal exercises, programs, sessions/sets, score baselines, rest deadlines, settings/measurements and common activation. Supplied catalogue lives in the image: keep it and SHA. Transactional restore revokes login sessions without cancelling training; elapsed rest displays zero.

Downgrade to 0005 requires **all** Sport tables empty. Once populated it refuses loss. Prefer forward fix or full compatible restore. Published migrations stay immutable. Container tests compare all five tables before/after synthetic restore.

### Sport set suggestions {#propositions-de-series-sport}

suggested_values extends new session entry JSONB without changing 0006_sport. Existing dumps/restores preserve suggestions, targets, sets/dates; comparisons include them. Old snapshots without the key remain readable by new code.

**Rollback compatibility:** earlier versions reject the new key in training contracts. After starting a new training session, do not simply roll back to those images: Alembic readiness cannot detect JSON incompatibility. Prefer a forward fix retaining the contract. Full earlier-dump/matching-image restore is possible but loses later writes; never strip keys or rewrite production history directly.

## Migration 0007 HYROX {#migration-0007-hyrox}

Back up before adding nullable competition_date columns to programs/sessions. Existing rows remain identical/null. Old writes can continue during addition but exact-revision probes reject the new schema.

Normal restore preserves dates/all Sport fields, including differing program/session dates. Tests cover empty-date round trip and existing rows. Downgrade refuses any date, even only in historical sessions. Prefer forward fix; earlier restore requires stopped writes and accounting for later data. Never erase production dates to bypass refusal.

## Migration 0008 account language {#migration-0008-langue-du-compte}

Adds non-null users.locale default fr with fr/en CHECK after 0007. Existing accounts remain French; no business history/snapshot rewrite. Back up and finish with new code, as old probes reject the revision.

Downgrade refuses any English account. Never alter preferences to force rollback; use forward correction or matching backup/image. Tests cover no-English round trip and refusal. Dumps preserve locale/theme; exercise/message catalogues are in the image. Container tests save English before backup and compare restored preferences alongside Sport/recurrence/history. On a test account verify login, both languages and supplied/personal same-name exercises.

## Migration 0009 Tracking {#migration-0009-suivi}

Adds trackers, dated definitions, entries, revisions, settings and immutable-history protection. Existing accounts/Tasks events/Sport sessions/preferences remain. Old writes to old tables are compatible during addition, but revision probes reject; finish with new image. No extra secret/service/volume.

Full dumps contain definitions/values/source snapshots/corrections/archives/order/timezones. Container restore compares every field of all five tables, other apps and session revocation. Verify manual/automatic entry, history, calendar and XP after restore. Disabled sources retain saved values while blocking fresh calculation.

Downgrade refuses any Tracking data, including settings. Never delete data or bypass triggers. Prefer forward fix or full known compatible restore; image rollback alone restores no data.

## Incomplete Sport session finish {#fin-de-seance-sport-incomplete}

The partial-finish feature extends session set JSONB with skipped true and zero measures, without SQL migration (0008_locale at its delivery). Existing sets remain and default to skipped false. Dumps/restores retain markers/results/dates/scores; acceptance creates partial sessions and compares all Sport tables.

Older images reject zeroes/skipped. After first partial finish, **do not directly return to an old image**, even with matching Alembic revision. Prefer forward correction. A necessary earlier restore must stop writes and use compatible dump/image while considering later data. Do not delete markers/rewrite results in production.

## Migration 0010: progression {#migration-0010-progression}

Adds activity/rewards/preferences/import markers and immutable triggers to normal PostgreSQL backup; no extra service/volume. Container tests compare every field and reject updates to restored journal.

No application data is rewritten. Explicit `life backfill-progression <account> --dry-run` estimates activities/base XP. Removing dry-run imports only that account in one owner-locked transaction; quest bonuses evaluate during import. Repeating does not duplicate rewards. Never automatically loop over accounts; deployment has no global backfill.

Old images reject 0010. Downgrade refuses any progression data including preferences. Prefer forward correction or full matching dump/image. Never delete rewards or disable triggers to force rollback.

## Migration 0011 OKR {#migration-0011-okr}

Adds objectives/events/settings without rewriting other applications. Old code can write its own tables during addition but rejects the new revision; publish new code. Downgrade refuses any OKR data, including timezone settings; empty-table round trip is for tests, not real-data rollback.

Back up the whole database. Restore all OKR tables together with users/activations/progression. Verify parents, result IDs/values/targets, versions/dates/archives, quarterly snapshots and deduplicated XP. Restored events reject UPDATE/DELETE. Container tests compare all fields and triggers; normal procedure invalidates sessions.

## Per-application progression calendars {#calendriers-de-progression-par-application}

Usage days live in progression_settings.settings.usage_days with the same versions/owner checks. SQL revision remained 0011_okr; no new service/data file. Historical documents lacking the key retain prior behavior. Dumps include calendars/vacations/versions; restore tests include Sunday-only Tracking and Sport three days weekly.

Matching Alembic revision does not establish compatibility: older images reject usage_days. After saving new settings, **do not automatically roll back to older code**. Prefer forward fix. If essential, use a complete matching backup/image and account for later activity. Do not manually strip preferences or rewrite journals.

## Migration 0012: recipes and shopping {#migration-0012-recettes-et-courses}

Back up first. Adds six tables and 301 supplied ingredients without changing old data/rights/services. Old processes may write their tables during addition but reject the new revision. Prefer forward correction; otherwise stop writes and restore prior dump/matching image.

Downgrade permits only the supplied catalogue: no recipes/items/lists/events/personal ingredients. Full backup includes supplied/private ingredients, decimals, purchased state, archives/completion/snapshots/progression. Container restore compares all six tables, immutability and revision. Sessions invalidate normally. Disabling preserves data and is never a backup.

## Migration 0013: recipe units {#migration-0013-unites-des-recettes}

Expands ingredient/recipe/list units to g/mg/l/ml/tsp/tbsp/u without converting quantities/purchases/dates/history. Back up first; restore all six tables with the whole database. Tests compare new units/snapshots too.

Old g/l/u writes stay compatible during migration, but old probes reject the revision. After a new unit is used, old code cannot read every object. Prefer forward correction or compatible backup/image. Downgrade refuses new units in ingredients/items/**immutable history**, even after removing the item. With none, narrowing columns/checks loses no data.

## Tasks agenda filters and bulk actions {#filtres-dagenda-et-actions-groupees-taches}

The Tasks UX delivery retains 0013_recipe_units and existing tables. Search/workspace/priority/label extend agenda JSON; older preferences use defaults. Normal backup preserves filters/tasks/recurrence/events. Older strict contracts reject the four keys: before returning to earlier code, back up then remove only these keys from affected agenda preferences, or restore the earlier backup with its image. Alembic alone does not prove compatibility. Bulk actions add neither a data type nor historical erasure.


## Migration 0014: Sport UX {#migration-0014-finition-sport}

Back up before `0014_sport_ux`. It adds view/version preferences and preparation snapshots without rewriting existing results. Full dumps preserve all five Sport tables and the common progression journal; restoration tests compare every field, including new columns. No additional service, volume or secret.

Downgrade to 0013_recipe_units refuses any saved view preference, explicit context or nonempty preparation snapshot. Without new data it removes columns while preserving sets, dates, scores and rest. Old-image readiness rejects the new revision: prefer a forward fix; otherwise restore a compatible dump and image using this guide’s transaction procedure. Never delete preferences/notes to bypass loss protection. Restoration revokes login sessions, preserves training sessions/deadlines and is verified through the API after signing in again.

## Sport score v2 {#score-sport-v2}

SQL revision stays `0013_recipe_units`. The calculation adds `scoring` to existing metrics JSONB without changing raw measurements. PostgreSQL dump/transactional restore retains references, provenance, counts, scores and roots; container acceptance compares all Sport tables after creating partial/empty v2 sessions. Existing numeric v1 scores remain unchanged.

Back up before deployment and targeted missing-score repair. Repair preserves sets, dates, notes, versions and rewards; repeating it has no effect. Returning to the previous image is **incompatible** despite the unchanged SQL schema: it rejects unknown JSON fields and could use an empty v2 session as a reference denominator. Prefer a forward fix; restoration needs a compatible dump/image, stopped writes and consideration of data created since backup. Do not delete calculation details to bypass this restriction.

## Migration 0016: sources and dictation

Additive migration `0016_assistant_sources` adds `assistant_sources`, `assistant_transcription_settings` and `external_context` (false for existing history). PostgreSQL dumps include binaries, extracted text and encrypted credentials; plan for quota-bounded growth. No separate file volume or audio backup; keep the keyring separately. Local deletion does not erase an older backup.

Downgrade refuses any source (including removed receipts), dictation configuration or externally marked conversation to preserve data and confirmations. Old images do not recognize the revision. Do not drop tables to roll back; restore a compatible backup and image using the existing procedure.

After restore, `restore-suffix.sql` revokes sessions, interrupts runs, invalidates previews, releases transcription leases and removes unfinished import reservations. Ready/bound sources, digests, metadata, extracted text, external marker and credentials remain intact. Verify integrity and authenticated downloads on a synthetic account. `life rotate-assistant-key <account> --dry-run`, then without the option, validates/re-encrypts both credentials atomically; one unreadable key aborts everything. Retain old keys needed for earlier dumps.

## Recipe web imports

Migration 0017 adds `source_url`, `source_title`, `imported_at` to recipes and `recipes_web_import_receipts` (owner/import composite key, recipe/owner composite foreign key, content fingerprint and timestamp). PostgreSQL backups retain attribution, receipts and creation events; disabling/re-enabling Recipes preserves them. Replaying a restored import finds the existing recipe. Downgrade refuses to discard receipts.

Browser pages, frames, cookies and profiles are transient and excluded from backups; stop `recipe-browser` before restoring, then restart it to invalidate in-memory leases too. Protect `.env.production` and its service token separately. Browsers have no persistent volume, SQL access or AI credentials.
