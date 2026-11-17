# Sport API

Programs are reusable `Workout` templates; training sessions are their `Training` executions. Technical `/workouts`, workout_id and JSON contracts remain stable. Page creation/editing uses the same POST/PUT without data conversion/migration.

Routes live under `/api/v1/sport`, requiring session, owner and Sport activation. Mutations use allowed origin/CSRF like [other APIs](api.md). `/api/docs` describes exact fields, bounds and responses.

| Method | Route | Operation |
| --- | --- | --- |
| GET | `/kinds` | Types, fields, units, limits and formulas |
| GET | `/exercises` | Supplied/personal catalogue; q,kind,muscle,equipment,archived,offset,limit (1–1000) |
| GET | `/exercises/{id}` | Supplied/personal exercise, including archived |
| POST | `/exercises` | Create personal exercise |
| PUT | `/exercises/{uuid}` | Replace personal exercise with expected_version |
| PUT | `/exercises/{uuid}/archive` | expected_version/archived; false restores |
| GET / PUT | `/settings` | rest_seconds 0–3600, default 90 |
| GET | `/workouts` | Active programs or archived=true |
| GET | `/workouts/{uuid}` | Program, including archived |
| POST | `/workouts` | Name, notes and ordered entries |
| PUT | `/workouts/{uuid}` | Replace program/order with expected_version |
| PUT | `/workouts/{uuid}/archive` | Archive/restore without changing sessions |
| POST | `/sessions` | `{workout_id,expected_version}` of program; prior-result suggestions |
| GET | `/sessions` | History, offset/limit 1–100 |
| GET | `/sessions/active` | Active session or null |
| GET | `/sessions/{uuid}` | Snapshot, sets, dates, score and baseline |
| PUT | `/sessions/{uuid}/sets/{entry}/{set}` | Confirm/correct `{expected_version,values}` |
| DELETE | `/sessions/{uuid}/sets/{entry}/{set}` | Undo set with expected_version body |
| PUT | `/sessions/{uuid}/rest` | Skip rest with expected_version |
| PUT | `/sessions/{uuid}/finish` | `{expected_version,outcome:completed/cancelled,notes}` |
| GET | `/measurements` | Active measurements or archived=true |
| POST | `/measurements` | Dated record with at least one measure |
| PUT | `/measurements/{uuid}` | Replace with expected_version |
| PUT | `/measurements/{uuid}/archive` | Archive/restore |
| POST | `/scores/backfill` | Repair only this account’s missing scores; no body; idempotent |
| GET | `/statistics` | Inclusive since/until, one year default, ten years maximum |

Program entries accept only `{exercise_id,sets,target}`. Targets are optional; confirmed set values require every measure specified by `/kinds`. Entry/set indices start at **0**. Supplied exercise IDs are stable strings; private objects use UUIDs. Entry order is program order. Returned snapshot names/types are display-only, not write fields.

Training entries also expose zero-indexed suggested_values, e.g. weight/reps per set; unused Values fields are null. A null position means no matching prior result; older snapshots return an empty list. Suggestions are training-response-only, not program inputs or performed sets.

At start, the server finds retained results for the same owner/program/exercise/type, newest completed/cancelled session first. Reordered exercises still match; duplicates match by occurrence rank. Undone, missing or skipped sets do not replace older values. Suggestions are frozen in the snapshot, without changing targets, performed sets, scores, dates or rest. For a new set lacking history, clients may suggest the preceding performed set in the current session, then target. Confirmation always requires explicit PUT, expected version and all required values.

Responses include UTC server_now/rest_until; display max(0, rest_until − server_now − elapsed since response). Corrections preserve completed_at and do not restart rest. Snapshot data/dates survive program edits/archives. Ended session results are API-immutable; explicit repair may only fill a missing score. Results, metrics, score and baseline_id remain readable. [Score formulas/limits](sport.md#statistics-and-score) apply to independent clients too.

Reads create neither objects nor catalogue copies. Writes are atomic and serialized per owner. On conflicts, reread/reconcile rather than blindly replacing the expected version.

## Finish an incomplete session {#terminer-une-seance-incomplete}

PUT finish with completed outcome works even with no confirmed sets. Within one transaction it preserves results and adds missing entry/set pairs with applicable measures zero, skipped true and completed_at equal to finished_at. Non-applicable response fields remain null. Rest stops and version increments once. Historical/explicit sets default to skipped false.

`SetResultValues` permits zero. Input `Values` retains positive repetitions, duration, distance and calories for manual confirmations/targets. skipped is a server-only response field, never sent in set PUTs. Unconfirmed sets become zero even if a nonzero target/suggestion was displayed.

`completed_sessions` includes these sessions; `total_sets` counts performed sets only. Skipped sets add no volume/distance or suggestions. Every new completed session receives a numeric v2 score, **0** if empty. `score_details` exposes version (2), planned/completed sets, `completion_percent`, `difficulty_percent` (null if empty) and `score`. `metrics[].scoring` stores per-set references (`values`, `sources`: `target`, `history`, `initial`), counts and the unrounded sum of effort ratios. Raw metrics stay unchanged. `baseline_id` points to the first v2 family session, even an empty one; that root has `baseline_id: null`. The [guide](sport.md#statistics-and-score) defines formulas and references. Existing numeric scores stay unchanged with `score_details: null` in a separate family.

Cancelled outcome adds no sets and retains no-score/no-statistics behavior. Session/activation/owner/CSRF/version remain mandatory. Repeating finish after ending returns **409** without adding results/changing history.

## Complete Python example {#exemple-complet-en-python}

Install httpx and privately configure LIFE_URL, LIFE_USERNAME and LIFE_PASSWORD. This deliberately creates a program/results in the signed-in account. The catalogue search is French; select a French account or adapt the search to its language.

```python
import os
import httpx

base = os.environ['LIFE_URL'].rstrip('/')
with httpx.Client(base_url=base + '/api/v1', headers={'Origin': base}) as client:
    def request(method, path, **kwargs):
        response = client.request(method, path, **kwargs)
        response.raise_for_status()
        return response.json()

    session = request('POST', '/auth/session', json={
        'username': os.environ['LIFE_USERNAME'],
        'password': os.environ['LIFE_PASSWORD'],
    })
    client.headers['X-CSRF-Token'] = session['csrf_token']
    request('PUT', '/applications/sport', json={'enabled': True})
    request('PUT', '/sport/settings', json={'rest_seconds': 90})
    exercise = request('GET', '/sport/exercises', params={
        'q': 'développé couché à la barre', 'kind': 'weight_reps',
    })['items'][0]
    workout = request('POST', '/sport/workouts', json={
        'name': 'Programme API',
        'entries': [{'exercise_id': exercise['id'], 'sets': 2,
                     'target': {'weight_kg': 40, 'reps': 10}}],
    })
    training = request('POST', '/sport/sessions', json={
        'workout_id': workout['id'], 'expected_version': workout['version'],
    })
    training = request('PUT', f"/sport/sessions/{training['id']}/sets/0/0", json={
        'expected_version': training['version'],
        'values': {'weight_kg': 40, 'reps': 10},
    })
    result = request('PUT', f"/sport/sessions/{training['id']}/finish", json={
        'expected_version': training['version'], 'outcome': 'completed',
        'notes': 'Example created through the API',
    })
    print(result['sets'][1]['values']['reps'])  # 0: second set not confirmed
    assert result['sets'][1]['skipped'] is True
    print(result['score'])  # Realized effort relative to references and planned sets
    print(request('GET', '/sport/statistics')['completed_sessions'])
    next_training = request('POST', '/sport/sessions', json={
        'workout_id': workout['id'], 'expected_version': workout['version'],
    })
    print(next_training['entries'][0]['suggested_values'][0])  # 40 kg, 10 reps
    assert next_training['sets'] == []  # no sets confirmed yet
```

Measurement example: POST `/sport/measurements` with `{"measured_on":"2026-11-14","weight_kg":75,"waist_cm":85}`; adapt date. Response ID/version support correction/archive. Omitted replacement values become null and notes become empty.

## Errors {#erreurs}

- 401: missing/expired session.
- 403: invalid origin/CSRF or disabled Sport (`X-Life-Application-Disabled: sport`).
- 404: unknown object/set index or another owner’s object.
- 409: stale version, already-active/ended session, archived program/exercise or duplicate measurement date.
- 422: unknown field, invalid type/bounds/incompatible fields, empty/future measurement or invalid period.

Counters/graphs exclude cancelled sessions and archived measurements. Session periods use started_at UTC; measurements use their saved calendar date. Other accounts’ existence is not revealed.

## HYROX competition date {#date-de-competition-hyrox}

Program POST/PUT accept optional ISO calendar competition_date or null. Numbers, nonexistent dates, empty strings and timestamps return 422. Years 0001–9999 and past dates are accepted. Omitting the field during PUT resets it to null, like other optional fields; resend it to preserve it during unrelated edits.

```json
{
  "name": "HYROX — preparation",
  "competition_date": "2027-04-17",
  "notes": "Preparing for my next competition",
  "entries": [{"exercise_id": "builtin-da98dd6929927833d279", "sets": 1,
               "target": {"distance_m": 1000, "duration_seconds": 300}}]
}
```

Resolve the exercise ID through catalogue search before using the example. Updates add expected_version; clear with null. Normal session/activation/owner/CSRF/conflict protections apply.

Programs and sessions (active/history/statistics) expose competition_date. The server copies it on start without modifying previous sessions; old sessions return null. Storage is independent of title, but the client displays branding only for a case-insensitive hyrox title. Countdown uses client local timezone and the calendar date, without extra storage or session setting. API clients can manage the entire feature.

## Bilingual catalogue {#catalogue-bilingue}

builtin distinguishes supplied/personal exercises. Responses also expose stable muscle_id/equipment_id codes (null for personal), separate from display muscle_group/equipment. Do not send response-only fields when creating personal exercises.

Account language localizes supplied names, notes, aliases, facets, kinds and supplied exercise names in programs/training/metrics/statistics. Search uses that language; muscle/equipment filters accept stable codes, current labels and historical French labels. Personal text, results, dates, versions, signatures and scores stay unchanged. Reads never rewrite snapshots. See [language contracts](internationalisation.md#api-independante-de-linterface).

## Repair missing scores {#reparer-les-scores-manquants}

`POST /api/v1/sport/scores/backfill`, without a body, computes scores **only** for this account’s `completed` sessions with null `score`. The response is `{"updated_sessions": 2}` (count varies). Repeating it returns zero. Session, CSRF/origin, enabled Sport and the owner lock apply. References are reconstructed in finish/id order from saved snapshots, never future results. Older snapshots without suggestions use targets then initial calibration.

```bash
curl --fail --request POST "$BASE/api/v1/sport/scores/backfill" \
  --cookie cookies.txt --header "X-CSRF-Token: $CSRF"
```

The transaction preserves sets, dates, notes, versions, existing numeric scores, raw metrics and progression. Only score, baseline and calculation details of repaired sessions are saved. Detail/history/statistics GETs then expose the same values; reads never trigger repair. Back up before a production repair; see [deployment](deploiement.md#livraison-du-score-sport-v2).
