# OKR Goals API

Prefix `/api/v1/okr`. Shared session, authenticated owner and enabled `okr` application are required. Every mutation requires `X-CSRF-Token` and an allowed origin. Composition automatically guards every route. [Swagger](https://life.thibault-leveau.com/api/docs) provides full schemas.

## Routes and contracts {#routes-et-contrats}

| Method/route | Contract |
| --- | --- |
| GET `/objectives?archived=false` | Active/archived objectives in persistent order; at most 5,000 per account |
| POST `/objectives` | `ObjectiveInput` → 201 `ObjectiveOutput` |
| GET `/objectives/{id}` | Read, including archived |
| PUT `/objectives/{id}` | Full replacement plus expected version |
| PUT `/objectives/{id}/move` | `{expected_version,status,position}`; insertion capped at column size |
| PUT `/objectives/{id}/key-results/{key_result_id}` | `{expected_version,value,note?}` check-in |
| PUT `/objectives/{id}/archive` | `{expected_version,archived}` without loss |
| GET `/objectives/{id}/history?offset=0&limit=30` | Event snapshots, 1–100 per page |
| GET `/achievements?quarter=2026-Q4&offset=0&limit=30` | Requested/current quarter, available quarters, total and accomplishments with reopened flag |
| GET `/settings` | Timezone, version (0 if implicit), current day/quarter |
| PUT `/settings` | `{expected_version,timezone}` |

`ObjectiveInput` contains title, domain personal/professional, horizon ten_year/three_year/annual/quarterly, nullable parent UUID, why, outcome, first_action, nullable start/due dates and key_results. Results contain UUID (generated if absent), title, start, target, current and unit. Preserve their IDs when editing. Unknown fields are rejected; owner, completion dates, actual quarter and XP never come from clients.

Output adds ID, version, backlog/in_progress/done status, position, planned/actual quarter, percentage progress and UTC creation/update/completion/archive dates. Position is insertion among active objectives with the same horizon/status, independent of domain/quarter filters. Reordered neighbors receive new versions: reload after movement.

The server validates [progressively required details and one-month plans](okr.md). Completion requires every result to meet its target. Reopen done objectives before editing by moving to in_progress/backlog. Reads never award rewards; events/rewards share the mutation transaction.

## Standalone example {#exemple-autonome}

Sign in with the [session API](api.md#session-et-protections), retaining cookies and CSRF privately. These examples create actual data:

```bash
curl --fail-with-body -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT https://life.thibault-leveau.com/api/v1/applications/okr \
  --data '{"enabled":true}'

curl --fail-with-body -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/okr/objectives \
  --data '{"title":"Tester mon offre","domain":"professional","horizon":"quarterly",
    "why":"Build a sustainable activity","outcome":"Five documented responses",
    "first_action":"Inviter le premier client","start_date":"2026-11-16","due_date":"2026-12-15",
    "key_results":[{"title":"Entretiens clients","start":0,"current":0,"target":5,"unit":"clients"}]}'
```

Using response `OBJECTIVE_ID`, `KEY_RESULT_ID` and `VERSION`:

```bash
curl --fail-with-body -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT "https://life.thibault-leveau.com/api/v1/okr/objectives/$OBJECTIVE_ID/key-results/$KEY_RESULT_ID" \
  --data "{\"expected_version\":$VERSION,\"value\":5,\"note\":\"Cinq retours obtenus\"}"
```

Use the new version before moving with `{"expected_version":2,"status":"done","position":0}` on `/objectives/{id}/move`. The server computes the actual quarter, which can differ from the planned quarter.

## Metrics and progression {#metriques-et-progression}

`GET /api/v1/integrations` discovers `okr`. `/integrations/okr/options/objective_id?q=offer&offset=0&limit=30` searches only the account’s objectives, including archives. Evaluation accepts:

```json
{
  "application_id": "okr", "metric_id": "completed", "aggregation": "count",
  "filters": {"domain":"professional", "horizon":"quarterly"},
  "since":"2026-10-01", "until":"2026-12-31", "timezone":"Europe/Paris"
}
```

Metrics: completed (first completion per objective), key_results (first attainment per result within an objective), check_ins (explicit value confirmations including corrections). Only count is supported. Empty counters equal zero. First occurrence is identified before temporal/domain filtering: another completion is not a new first success. Query timezone determines daily boundaries; immutable snapshots determine domain/horizon. Disabled source returns 409 and preserves Tracking snapshots.

Shared `/api/v1/progression/okr`, `/okr/quests` and `/okr/history` expose levels, 60 quests and journal. Stable reward keys are `objective:<uuid>` and `result:<objective_uuid>:<result_uuid>`; corrections, archives and reopening never renew them. Explicit `life backfill-progression <account>` reads only that owner’s events with identical deduplication.

## Errors {#erreurs}

- 401: missing/expired session.
- 403: invalid CSRF/origin or disabled application (`X-Life-Application-Disabled: okr`).
- 404: unknown/other-owner objective, result or filter.
- 409: stale version, editing completed/archived objectives, changing domain/horizon of a parent with children, or disabled metric source.
- 422: missing details, plan beyond one month, target equal to start, invalid date/number/horizon/domain, unmet results on completion, invalid parent or quota.

Responses are localized and not cached. Historical data cannot be edited through the API; corrections add events. See [data](donnees.md#donnees-okr) and [restore](sauvegardes.md#migration-0011-okr).
