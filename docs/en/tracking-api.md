# Tracking API

`/api/v1/tracking` uses shared session, CSRF and tracking activation. [OpenAPI](/api/docs) supplies exact typed bodies/responses. Owner comes from session, never input. Unknown fields are rejected.

| Method/path after `/api/v1/tracking` | Operation |
| --- | --- |
| `GET /trackers?archived=false` | Active trackers in personal order; true lists archives |
| `POST /trackers` | Create, 201 |
| `GET /trackers/{id}` | Current definition |
| `PUT /trackers/{id}` | Replace definition with expected_version |
| `PUT /trackers/order` | `{ids:["uuid",…]}`, exact active set |
| `PUT /trackers/{id}/archive` | Strict archived boolean and expected_version |
| `GET /settings`, `PUT /settings` | Dashboard timezone and creation default |
| `GET /current?day=YYYY-MM-DD&include_archived=false` | Periods containing day; absent means today in each timezone |
| `GET /calendar?since=…&until=…&tracker_id=…` | Daily days and long occurrences separately |
| `GET /statistics?since=…&until=…&tracker_id=…` | Calendar, consistency, average score, achievements and selected tracker trends |
| `GET /achievements` | Legacy recalculated entry XP/five badges; new wall uses /progression |
| `GET /trackers/{id}/entries/{day}` | Occurrence, applicable definition and possible entry |
| `POST /trackers/{id}/entries/{day}/preview` | Source preview without writes; CSRF required |
| `PUT /trackers/{id}/entries/{day}` | Partial save, draft or confirmation |
| `GET /trackers/{id}/entries/{day}/history?limit=30&offset=0` | Corrections by descending version; max 100/page |

Day selects the period. Multiple days of one week address the same entry, unique per tracker/period start. Future periods cannot be entered. Calendar filters accept archived trackers; include_archived exposes past occurrences.

## Definitions and values {#definitions-et-valeurs}

Definitions contain name, description, frequency daily/weekly/monthly/yearly, timezone, start_date, hexadecimal color and 1–30 fields. See [user limits/frequencies](tracking.md). Frequency, start date and timezone are immutable after creation. Each field has a stable 1–60-character alphanumeric/underscore/hyphen ID, label, kind, unit, required, weekdays (0 Monday–6 Sunday), bounds, options, goal, weight and optional source. Type/unit cannot change for an existing ID; use a new ID for a different series.

Numbers are finite between −10¹² and 10¹² and obey field bounds. Booleans are strict: false differs from zero. Null clears a value; omission preserves it. Unknown keys, unscheduled fields and manual writes to automatic sources are rejected. Choices must match options. Manual duration uses minutes (`unit:"min"`, supplied if omitted; other units rejected). Source units must match discovery. Goals use `{mode,target,upper?,tolerance}`; tolerance >0, weight >0 and ≤10.

New entries use expected_version 0; corrections use the returned version. Complete false saves/reopens a draft; complete true requires all mandatory responses and at least one value. Existing automatic snapshots persist unless refresh_sources true. Every success appends an immutable revision; errors roll back everything. See [scores and XP](tracking.md#calendar-statistics-and-rewards).

## Independent example {#exemple-independant-de-linterface}

Sign in using the [common API](api.md), store cookies in `cookies.txt` and CSRF privately. Never save these secrets in the repository.

```bash
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT https://life.thibault-leveau.com/api/v1/applications/tracking \
  -d '{"enabled":true}'

curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/tracking/trackers \
  -d '{"name":"My daily balance","frequency":"daily","timezone":"Europe/Paris","start_date":"2026-11-16","fields":[{"id":"water","label":"Water","unit":"L","weekdays":[0,1,2,3,4,5,6],"goal":{"mode":"at_least","target":2,"tolerance":2}},{"id":"walk","label":"Walk","kind":"boolean","weekdays":[0,1],"goal":{"mode":"equals","target":true}}]}'

# Replace <id> with the returned ID and choose a scheduled date that is not in the future.
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT 'https://life.thibault-leveau.com/api/v1/tracking/trackers/<id>/entries/2026-11-16' \
  -d '{"expected_version":0,"values":{"water":0,"walk":false},"complete":true}'
```

This entry is complete and scores 0/10. Correcting with version 1, water 2 and walk true gives 10/10; history retains both. Adapt dates to your tracker.

## Errors and availability {#erreurs-et-disponibilite}

- 401 missing/expired session; 403 invalid CSRF/origin or disabled Tracking.
- 404 another owner’s tracker, unknown reference or no scheduled occurrence.
- 409 stale version or disabled source during configuration/evaluation.
- 422 invalid contract, missing required data, future date, volume/period limit or invariant change.

Entry evaluation converts source 404/409/422 into unavailable, without signing the consumer out. Empty counters are zero; absent average/latest observations are missing; unreconstructible history is unavailable. No fictional fallback value is supplied.

Query dates are 2000–2100; calendar/statistics permit 367 inclusive days. Sources are bounded to ten years and 20,000 observations. Calculations also limit entries to 20,000; excess returns 422 without silent truncation. See [integrations](integrations.md), [data](donnees.md#donnees-de-suivi), [restore](sauvegardes.md#migration-0009-suivi).

Per-app progression, 60 quests, levels to 100, titles, earned XP history, usage days/vacations use the [shared progression API](api.md#progression-par-application). Historical EntryOutput.xp and Statistics.achievements remain recalculated entry indicators, distinct from the earned journal.
