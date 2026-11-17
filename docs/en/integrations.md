# Data integrations between applications

Tasks, Sport, OKR and Recipes publish metrics consumed by Tracking. The [approved contract](decisions/005-integrations-tracking.md) keeps providers within their business domains and composes manifests through the existing registry. No cross-domain imports, arbitrary SQL, remote scripts, screen-time collection or extra analytics service.

## Shared API {#api-commune}

| Route under `/api/v1` | Contract |
| --- | --- |
| `GET /integrations` | Sources, activation, localized names/descriptions, units and allowed filters/aggregations |
| `GET /integrations/{application_id}/options/{filter_id}?q=…&offset=0&limit=30` | Private searchable/paginated options; max 100; name or exact identifier search |
| `POST /integrations/evaluate` | Query/result with value, status, unit, observation date and sample size |

Session is required everywhere; POST evaluation needs CSRF. Disabled-source options/evaluation return 409. Unknown/foreign references return 404; incompatible metric/filter/aggregation or excess volume returns 422. Discovery contains metadata only, never private values.

```json
{
  "application_id": "tasks",
  "metric_id": "completed",
  "aggregation": "count",
  "filters": {"due_state": "late"},
  "since": "2026-11-01",
  "until": "2026-11-30",
  "timezone": "Europe/Paris"
}
```

```bash
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/integrations/evaluate \
  -d '{"application_id":"sport","metric_id":"completed","aggregation":"count","filters":{},"since":"2026-11-01","until":"2026-11-30","timezone":"Europe/Paris"}'
```

Local dates are inclusive. Events use the half-open UTC interval from first-day midnight to midnight after the last day; 23/25-hour DST days are supported. Dates span 2000–2100, maximum difference 3,660 days, eight filters and 20,000 observations before aggregation. Empty count/sum is zero; average/min/max/latest without values and change with fewer than two observations are missing. Unreconstructible results are unavailable. Sample_count describes calculation observations, not visits.

A Tracking field’s source retains application_id, metric_id, aggregation, filters, plus period tracking/daily/weekly/monthly/yearly. The server derives bounds around the selected day. Within a long entry, daily sources describe that selected day; choose tracking for the whole period. Snapshots explicitly retain bounds. Choose a negative numeric minimum for potentially negative body changes.

## Tasks rules {#regles-de-taches}

Events use historical workspace/section/status/recurrence/due-date context. Undone completion disappears from new previews; reopening retains earlier completion. completed counts occurrences; completed_distinct counts unique tasks. Recurring tasks may count repeatedly. Current archives never remove historical events.

Rescheduled counts **manual** due-date changes, including removal or first assignment after creation, excluding automatic recurrence advances and completion undo. Rescheduled_tasks deduplicates tasks. Reports_more_than requires strictly more than N changes within the requested period/other filters, excluding earlier changes.

Late_days compares local completion day to historical due date, floored at zero. Resolution_days measures creation → completion in 24-hour days; recurrence uses task creation, not an unknown cycle start. On_time_rate is the percentage of dated completions on time. All three use non-undone completions. Due_state late/on_time/undated uses event due dates.

Current metrics evaluate only periods containing today. Task/section/workspace archives are excluded except archived_current. Due counts open tasks with current due date in the window. Priority/label filters apply only to current states because their full history is unavailable. Options include archived references for historical analysis, never other owners’ references.

## Sport rules {#regles-de-sport}

Completed-session metrics use finished_at. Started counts all starts; completion_rate counts completed sessions among those started in the window at calculation time. Exercise/type filters select sessions containing those entries and matching sets; they do not partition total session duration.

Set values come from completed snapshots. Skipped zero sets are excluded from performed counts/measure aggregations; the finished session still counts. A session with no performed sets has zero sets and no average load. Elapsed_seconds is start-to-finish including rest; duration_seconds is entered effort duration. Volume is weight × reps; no bodyweight load is invented. Speed uses distance/duration for entries supplying both, per session, then aggregates session speeds. Exercises without the required measure are ignored.

Scores aggregate only for one program/comparison signature; incompatible results are unavailable and ask for narrower filters/periods. Archived programs/sessions remain analyzable; archived body measurements are excluded from new calculations. Change is last minus first in the window, never replacing missing points with zero.

## Delivered catalogue {#catalogue-livre}

Identifiers/units are stable; names, descriptions and filters localize. Discovery is authoritative for building clients; do not duplicate a parallel catalogue.

### Tasks {#taches}

| Identifier | Metric | Unit | Aggregations | Filters |
| --- | --- | --- | --- | --- |
| `archived` | Task archives | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `archived_current` | Currently archived tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `closed` | Currently completed tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `completed` | Completed task occurrences | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `completed_distinct` | Distinct completed tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `completion_undone` | Undone completions | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `created` | Created tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `due` | Currently due open tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `late_days` | Lateness at completion | d | `average`, `sum`, `min`, `max` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `moved` | Task movements | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `on_time_rate` | On-time completions | % | `average` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `open` | Currently open tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `overdue` | Currently overdue tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `recurring` | Active recurring tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `label_id`, `priority` |
| `reopened` | Task reopenings | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `rescheduled` | Manual reschedules | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state`, `reports_more_than` |
| `rescheduled_tasks` | Rescheduled tasks | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state`, `reports_more_than` |
| `resolution_days` | Creation-to-completion delay | d | `average`, `sum`, `min`, `max` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |
| `restored` | Task restorations | — | `count` | `workspace_id`, `section_id`, `status_id`, `recurring`, `due_state` |

### Sport {#sport}

| Identifier | Metric | Unit | Aggregations | Filters |
| --- | --- | --- | --- | --- |
| `assistance_kg` | Assistance used | kg | `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `calories` | Entered calories | kcal | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `cancelled` | Cancelled sessions | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `completed` | Completed sessions | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `completion_rate` | Session completion rate | % | `average` | `workout_id`, `exercise_id`, `kind` |
| `distance_m` | Distance covered | m | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `duration_seconds` | Entered effort duration | s | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `elapsed_seconds` | Session elapsed time | s | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `measurements` | Body measurement records | — | `count` | — |
| `programs` | Programs practiced | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `reps` | Performed repetitions | — | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `score` | Sport progress index | % | `average`, `min`, `max`, `latest` | `workout_id` |
| `sets` | Performed sets | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `speed` | Average speed per session | m/s | `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `started` | Started sessions | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `training_days` | Training days | — | `count` | `workout_id`, `exercise_id`, `kind` |
| `volume_kg` | Lifted volume | kg | `sum`, `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `weight_kg` | Weights used | kg | `average`, `min`, `max`, `latest` | `workout_id`, `exercise_id`, `kind` |
| `body_weight_kg` | Body weight | kg | `latest`, `average`, `min`, `max`, `change` | — |
| `body_body_fat_pct` | Body fat | % | `latest`, `average`, `min`, `max`, `change` | — |
| `body_neck_cm` | Neck circumference | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_shoulders_cm` | Shoulder circumference | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_chest_cm` | Chest circumference | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_waist_cm` | Waist circumference | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_hips_cm` | Hip circumference | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_arm_left_cm` | Left arm | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_arm_right_cm` | Right arm | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_thigh_left_cm` | Left thigh | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_thigh_right_cm` | Right thigh | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_calf_left_cm` | Left calf | cm | `latest`, `average`, `min`, `max`, `change` | — |
| `body_calf_right_cm` | Right calf | cm | `latest`, `average`, `min`, `max`, `change` | — |

## OKR provider {#fournisseur-objectifs-okr}

okr provides completed, key_results and check_ins, count only. Objective options are owner-limited, including archives; domain/horizon are selection filters. The first two count distinct first successes identified before temporal boundaries; corrections do not move them to later periods. Check_ins counts explicit confirmations/corrections, excluding editor changes. Domain/horizon come from immutable snapshots. Empty counts are zero; current state is never projected into history. Disabling blocks new reads without erasing saved Tracking values. [Examples](okr-api.md#metriques-et-progression).

## Recipes and shopping source {#source-recettes-et-courses}

recipes provides recipes (created recipes), lists (completed lists), imports (distinct imported list/recipe pairs), templates (templates becoming nonempty). All are historical count-only metrics without filters. They count first confirmations within requested period/timezone, archives included. Reopening/correction never counts twice. No event means zero; disabled means unavailable; Tracking snapshots remain. [Guide](recipes.md#tracking-and-rewards).
