# API reference

Every interface business feature uses `/api/v1`. Exact schemas, required fields and responses are available in [OpenAPI](https://life.thibault-leveau.com/api/openapi.json) and [Swagger UI](https://life.thibault-leveau.com/api/docs) for the deployed commit. Private routes require a session; there is no public registration.

## Session and protections {#session-et-protections}

| Method/path under `/api/v1` | Contract |
| --- | --- |
| `POST /auth/session` | `{username,password}` → 200 session and `life_session` cookie |
| `GET /auth/session` | Current session, expiry, theme and `csrf_token` |
| `DELETE /auth/session` | Revoke session/remove cookie, 204 |
| `GET /preferences` | `{theme, locale}` |
| `PUT /preferences` | `{theme?: "system" \| "light" \| "dark", locale?: "fr" \| "en"}`; omitted fields preserved |

The cookie is HttpOnly, SameSite=Lax and Secure in production. Passwords are never returned. Usernames are trimmed and casefolded; passwords remain exact. Sessions expire after `LIFE_SESSION_HOURS` (168 by default), without automatic extension.

Retain the cookie and send **`X-CSRF-Token`** on every mutation, including sign-out/preferences. `GET /auth/session` recovers the token after reload. Browsers must use the configured origin. Independent HTTP clients may omit `Origin` with valid cookie/CSRF; when present, it is checked, including sign-in.

Swagger displays contracts, but browser JavaScript cannot set an arbitrary Cookie header. Use a session from the same origin and supply `X-CSRF-Token` in the operation. The Python examples show independent clients.

## Library and activation {#bibliotheque-et-activation}

| Method/path | Contract |
| --- | --- |
| `GET /applications` | Ordered delivered applications and signed-in account state |
| `PUT /applications/{id}` | `{ "enabled": true }` or `false` → saved application, 200 |

Entries contain `id`, `name`, `description`, `path`, `icon`, `enabled`, `updated_at` (UTC or `null` before the first explicit setting). Delivered applications are Tasks, Sport, Tracking, OKR and Recipes. Account language localizes names/descriptions. The shipped registry is authoritative; it contains no fake future apps. GET creates no missing preferences. Tasks defaults to enabled; other applications default to disabled.

PUT requires a strict JSON boolean, rejects unknown fields and client-selected ownership (422). Unknown identifier: 404; missing/expired session: 401; invalid origin/CSRF: 403. Writes use the shared user lock. Repeating a value after its first save changes neither state nor `updated_at`. Concurrent writes serialize; the last validated value wins without duplicates.

Disabled applications return 403 on every business route with explanatory `detail` and `X-Life-Application-Disabled: <id>`. For Tasks this includes tasks, workspaces, sections, statuses, labels, views, agenda and scheduling parse/preview. Authentication, preferences, library and probes remain available. A read past its activation check may finish; mutations share the toggle lock. Data/events remain unchanged.

Independent example, with `httpx` installed or `uv run python`:

```python
import getpass
import httpx

with httpx.Client(base_url="http://127.0.0.1:8100/api/v1", timeout=20) as client:
    response = client.post("/auth/session", json={
        "username": input("Username: "), "password": getpass.getpass(),
    })
    response.raise_for_status()
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    response = client.get("/applications")
    response.raise_for_status()
    print(response.json())
    response = client.put("/applications/tasks", json={"enabled": False})
    response.raise_for_status()
    assert client.get("/tasks").status_code == 403
    response = client.put("/applications/tasks", json={"enabled": True})
    response.raise_for_status()
```

Use HTTPS in production. Both PUTs really change the account preference; use a test account for trials.

## Workspaces and configuration {#espaces-et-configuration}

`{w}`, `{s}`, `{c}`, `{l}` represent workspace, section, status and label UUIDs.

| Method/path | Operation/response |
| --- | --- |
| `GET /workspaces?archived=false` | Ordered active workspaces; `true` lists archives |
| `POST /workspaces` | `{name,description?,color?,parent_id?}` → 201 workspace and three initial statuses |
| `GET /workspaces/{w}` | Authorized workspace, including archived |
| `PATCH /workspaces/{w}` | Name, description, color, `parent_id`, `archived` |
| `PUT /workspaces/order` | `{ids:[...]}` complete order including archives, 204 |
| `GET /workspaces/{w}/sections?archived=false` | Ordered sections; `true` lists archives |
| `POST /workspaces/{w}/sections` | Name, description, color, `visibility` → 201 section |
| `PATCH /workspaces/{w}/sections/{s}` | Properties, visibility, `archived` |
| `PUT /workspaces/{w}/sections/order` | Complete order including archives, 204 |
| `GET /workspaces/{w}/statuses` | Ordered statuses |
| `POST /workspaces/{w}/statuses` | `{name,color?,is_completed?}` → 201 status |
| `PATCH /workspaces/{w}/statuses/{c}` | Name, color, type |
| `PUT /workspaces/{w}/statuses/order` | Complete order, 204 |
| `DELETE /workspaces/{w}/statuses/{c}?replacement_id=...` | Remove/reassign, 204 |
| `GET /workspaces/{w}/labels` | Labels ordered by name |
| `POST /workspaces/{w}/labels` | `{name,color?}` → 201 label |
| `PUT /workspaces/{w}/labels/{l}` | Replace name/color |
| `DELETE /workspaces/{w}/labels/{l}` | Remove associations and corresponding filter, 204 |
| `GET /workspaces/{w}/view` | View settings |
| `PUT /workspaces/{w}/view` | Replace settings; omitted fields reset to defaults |

Workspace/section names: 1–120 characters; statuses: 1–80; labels: 1–50; descriptions: at most 20,000. Colors use `#RRGGBB`. `visibility` is `list`, `board` or `both`. `ids` must contain every relevant object exactly once, including archives, otherwise 409; at most 10,000 identifiers.

Workspaces, sections and tasks use PATCH `{archived:true/false}` for archive/restore, without permanent DELETE. Tasks under archived parents cannot be edited: restore parents first. Parent renames do not change historical events.

Every workspace retains at least one open and one completed status. Changing an in-use status’s `is_completed` is rejected. Removing an in-use status requires a same-workspace replacement of the same open/completed type, including for archived tasks; completion dates survive.

### Workspace hierarchy {#hierarchie-des-espaces}

Workspace responses include `parent_id` (UUID/null). Omitted/null on creation means root. PATCH omission preserves it, null detaches, and UUID reparents. Parents must be active and owned: unknown/foreign 404, archived 409, malformed UUID 422. Self-parenting and indirect cycles return 409, including concurrent requests.

GET remains flat, sorted by `position` then UUID; reconstruct the tree using `parent_id`. Global order includes archives and defines sibling order. Reordering never reparents. Moving preserves position; descendants follow without moving their tasks. Task workspace filters do not include descendants.

Archiving with active children returns 409; archive/move them first. Restoring beneath an archived parent returns 409, but restoration may combine `parent_id:null` or another active parent. No cascade changes individual archives or task events. All mutations require session, owner, origin and CSRF.

### View preferences {#preferences-de-vue}

```json
{
  "layout": "board",
  "density": "comfortable",
  "show_completed": false,
  "search": "",
  "sort": "manual",
  "status_id": null,
  "priority": null,
  "label_id": null,
  "due": "all"
}
```

Values: layout list/board, density comfortable/compact, sort manual/priority/due_date, due all/overdue/today/upcoming/none. Optional priority is 1–4; search max 500 characters. Referenced status/label must belong to the workspace. Default layout is list; other defaults appear above. Settings never change lifecycle.

`show_completed` defaults to false; explicit values remain API-readable/writable. The interface nevertheless hides completed tasks on every open/reload, even if stored true. Explicitly showing them uses the preference during that visit; other settings survive reload. API clients request `GET /tasks?workspace_id=<uuid>&completed=false` for open tasks; omitting `completed` includes both.

## Global agenda {#agenda-global}

| Method/path | Contract |
| --- | --- |
| `GET /agenda/view` | Account preferences or defaults |
| `PUT /agenda/view` | Replace preferences; omissions reset to defaults |
| `GET /agenda/tasks?today=2026-12-31&offset=0&limit=200` | Tasks across active workspaces using saved preferences |

```json
{"period":"today","custom_days":14,"include_overdue":true,"show_completed":false,"search":"","workspace_id":null,"priority":null,"label_id":null}
```

`period` accepts today/tomorrow/week/custom. Integer `custom_days` is 1–90 and retained for other periods. Week covers today plus six days; custom covers the requested days starting today; tomorrow covers only tomorrow. Bounds are inclusive. `include_overdue` adds earlier dates for open tasks only; `show_completed` includes completed tasks within the period. Order is due date, position, UUID.

Search (0–500 characters) matches title/description. Optional workspace/label UUIDs must belong to the account (404 otherwise); labels must belong to the chosen workspace (422 otherwise). Priority is null or 1–4. These four filters persist with the other preferences without changing tasks.

Responses contain `items,total,offset,limit,today,start_date,end_date`, with ordinary task fields. Offset is nonnegative; limit 1–200, default 100. `today` is the client’s local date, defaulting to server date when omitted. Invalid dates/settings/pagination or periods beyond year 9999 return 422.

Queries exclude undated tasks, direct archives and tasks under archived workspace/section parents, regardless of section list/board visibility. Owner always comes from the session. Missing session returns 401; invalid PUT origin/CSRF returns 403. Preferences do not change task dates, versions or events. Result actions use existing `/tasks/{id}` routes.

Example using the authenticated client below:

```python
# client is authenticated; base_url ends in /api/v1.
# client.headers includes X-CSRF-Token as in the complete example below.
response = client.put("/agenda/view", json={
    "period": "custom", "custom_days": 10,
    "include_overdue": True, "show_completed": False,
})
response.raise_for_status()
response = client.get("/agenda/tasks", params={
    "today": "2026-12-31", "offset": 0, "limit": 200,
})
response.raise_for_status()
agenda = response.json()
# Continue with offset += len(agenda["items"]) until total.
```

## Tasks {#taches}

| Method/path | Contract |
| --- | --- |
| `GET /tasks` | Filtered, paginated list |
| `POST /tasks` | Create → 201 task |
| `GET /tasks/{id}` | Authorized task, including archived |
| `PATCH /tasks/{id}` | Atomic edit/archive/restore |
| `POST /tasks/{id}/move` | Atomic movement/order |
| `POST /tasks/{id}/complete` | Complete |
| `POST /tasks/{id}/reopen` | Reopen |
| `GET /tasks/{id}/events` | Paginated chronological history |

Creation requires `workspace_id` and `title` (1–500 characters), with optional `section_id`, `status_id` (first open status by default), `description`, priority (default 4), due date (`YYYY-MM-DD`/null), and up to 100 distinct label IDs. References must share the workspace.

Responses add UUID, position, version and UTC `created_at,updated_at,completed_at,archived_at`. Every task mutation requires the last-read **`expected_version`**. A 409 requires rereading and a client decision, never automatic overwrite.

PATCH accepts creation fields except workspace ID, plus `archived`. Omitted fields stay unchanged; null section/date clears them. Restore an archived task using only expected version and `archived:false`, after restoring its parents.

Move input:

```json
{
  "expected_version": 3,
  "workspace_id": "destination-workspace-UUID",
  "section_id": null,
  "status_id": "destination-status-UUID",
  "before_id": null
}
```

`before_id` is an active task in the target section; null appends to workspace order, and thus its list/cell. The reference task need not have the same status because ordering is workspace-wide. Cross-workspace labels match exact names, preserving an existing destination label.

Complete/reopen accepts `{expected_version:...}` and chooses the first compatible status. Repeating an already-satisfied state adds no completion; stale versions still conflict.

### Filters and pagination {#filtres-et-pagination}

`GET /tasks` accepts `workspace_id,section_id,status_id,priority,label_id,search,completed,archived,due,today,sort,offset,limit`. Omitting workspace spans the owner’s workspaces. Foreign-resource filters return an empty list without disclosing data.

- `archived=false` excludes individual/parent archives; true selects effective archives.
- Search is a case-insensitive title/description substring; `%` and `_` are literal.
- Overdue excludes completed tasks; today/upcoming filter dates independently of completion.
- `today` supplies the client’s calendar date; omission uses the server date.
- Manual order uses position; priority puts P1 first; due-date sorting puts undated last.
- Limit defaults to 100, allowed 1–200; offset starts at zero.

Tasks/events return `{items,total,offset,limit}` with the same pagination bounds. Event context omits copied task title/description. See [Data](donnees.md).

## Scheduling and recurrence {#planification-et-recurrences}

Parsing/preview use normal session, origin and CSRF checks, without saving tasks or logging submitted text.

| Route | Input | Output |
| --- | --- | --- |
| `POST /scheduling/parse` | `text` max 1,000 characters, local `today`, IANA `timezone` default Europe/Paris | Cleaned title, matched text, Unicode offsets, due date, recurrence, label and preview dates |
| `POST /scheduling/preview` | `recurrence`, optional inclusive `after`, limit 1–12 (default 6), completed 0–10000 | `label,dates,explanation` |
| `POST /tasks/{id}/undo-complete` | `expected_version` | Task restored before last completion |

Parse returns status none/recognized/incomplete/invalid and nullable localized diagnostic. Recognized supplies date/rule/preview; none preserves literal text. Incomplete/invalid also preserve the full title, with null match/rule/date and empty dates: no partial composition. These diagnostics are HTTP 200; offer correction or explicit literal preservation. Out-of-contract input, invalid explicit rules, empty previews or missing recurrent due dates return 422. Session/CSRF/origin/owner checks remain 401/403/404.

Date-only input can leave an empty title; ask for one before creation. Offsets are Python Unicode code points, not JavaScript UTF-16 units. Quoted/unrecognized text stays literal. Composable shortcuts use the same preview engine and constraints: written numbers, cadence, selected days/months/positions, bounds/exclusions in different orders. Cadence plus calendar selections align the anchor to the first compatible date before exclusions. This affects explicit parsing only; stored/direct RRULEs stay unchanged.

`TaskCreate`, `TaskPatch` and `TaskOutput` accept/expose nullable `recurrence`:

| Field | Contract |
| --- | --- |
| `rrule` | Max 512 characters; DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL 1–1000, BYDAY/BYMONTHDAY/BYMONTH/BYSETPOS/BYYEARDAY/BYWEEKNO/WKST validated by frequency. No DTSTART/COUNT/UNTIL/RDATE or hourly frequency in this string |
| `start_date` | Required calendar anchor; Monday is default week start |
| `timezone` | IANA timezone, default Europe/Paris; browser supplies its own |
| `mode` | scheduled (default) or completion; completion permits only FREQ/INTERVAL |
| `end_date` | Inclusive ending/null, not before start |
| `max_occurrences` | 1–10000 completions including first, or null; mutually exclusive with end date |
| `excluded_dates` | Up to 366 dates, deduplicated/sorted |

Creation without explicit due date takes the first anchored occurrence. An explicit date can postpone outside the regular schedule but must respect bounds/exclusions. Recurring creation requires an open status. Read-only `recurrence_completed` counts completions of the current definition. Rule changes reset it; date-only edits preserve anchor/rule/count. Null recurrence removes repetition; also send null due date to clear both. Omission preserves the rule.

In completion mode, early completion can place the next due date before the original anchor; intervals follow the actual completion day. Editing/archiving still works. Start remains the creation/definition-change boundary; end/exclusions apply to every occurrence.

Direct `/tasks` titles stay literal. Parsing is explicit, protecting existing clients. The following French parsing example assumes a French account; choose English account language and an English expression for English parsing:

```bash
curl --fail -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/scheduling/parse \
  -d '{"text":"Courir tous les mercredis toutes les trois semaines pour cinq fois","today":"2026-11-14","timezone":"Europe/Paris"}'

curl --fail -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  https://life.thibault-leveau.com/api/v1/scheduling/preview \
  -d '{"recurrence":{"rrule":"FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1","start_date":"2026-11-14","timezone":"Europe/Paris","max_occurrences":6}}'
```

Create using returned workspace/title/date/recurrence or a manually constructed rule. PATCH status and move share the same completion transition. Recurring complete advances atomically with one version increment: stale replay returns 409; intentionally using the new version completes the next occurrence. Repeating on an ended series with current version is a no-op.

Scheduled mode picks the first date strictly after `max(due_date, local completion day)`; completion mode anchors its next interval to completion day. Invalid/excluded dates are skipped. Exhausted count/calendar leaves the task completed. Completion-mode preview is indicative. Undo restores open status/date/count with a compensating event; intervening edits or stale version return 409. Reopen retains the previous completion history.

## Standalone Python example {#exemple-autonome-python}

After migration/account creation, run `uv run python` from the repository or an environment with `httpx`. Password input stays out of shell history. Use an HTTPS origin in production.

```python
import getpass
import httpx

with httpx.Client(base_url="http://127.0.0.1:8100/api/v1", timeout=20) as client:
    def call(method, path, **kwargs):
        response = client.request(method, path, **kwargs)
        response.raise_for_status()
        return None if response.status_code == 204 else response.json()

    session = call("POST", "/auth/session", json={
        "username": input("Username: "), "password": getpass.getpass(),
    })
    client.headers["X-CSRF-Token"] = session["csrf_token"]
    space = call("POST", "/workspaces", json={"name": "API example"})
    child = call("POST", "/workspaces", json={
        "name": "Subproject", "parent_id": space["id"],
    })
    call("PATCH", f"/workspaces/{child['id']}", json={"parent_id": None})
    call("PATCH", f"/workspaces/{child['id']}", json={"parent_id": space["id"]})
    # Archive children before parents; restore in reverse order.
    call("PATCH", f"/workspaces/{child['id']}", json={"archived": True})
    call("PATCH", f"/workspaces/{space['id']}", json={"archived": True})
    call("PATCH", f"/workspaces/{space['id']}", json={"archived": False})
    call("PATCH", f"/workspaces/{child['id']}", json={"archived": False})
    section = call("POST", f"/workspaces/{space['id']}/sections", json={
        "name": "To prepare", "visibility": "both",
    })
    statuses = call("GET", f"/workspaces/{space['id']}/statuses")
    task = call("POST", "/tasks", json={
        "workspace_id": space["id"], "title": "Verify the API flow",
    })
    task = call("POST", f"/tasks/{task['id']}/move", json={
        "expected_version": task["version"], "workspace_id": space["id"],
        "section_id": section["id"], "status_id": statuses[1]["id"],
    })
    for action in ("complete", "reopen", "complete"):
        task = call("POST", f"/tasks/{task['id']}/{action}", json={
            "expected_version": task["version"],
        })
    events = call("GET", f"/tasks/{task['id']}/events")
    print([event["kind"] for event in events["items"]])
    call("PUT", "/preferences", json={"theme": "dark"})
    call("DELETE", "/auth/session")
```

This creates real data in the selected database; archive examples afterwards if no longer needed. Never publish cookies, passwords or tokens in examples/screenshots.

## Errors {#erreurs}

| Code | Meaning |
| --- | --- |
| 401 | Missing/expired/revoked session or incorrect credentials |
| 403 | Rejected origin/CSRF or disabled application |
| 404 | Missing or other-owner resource |
| 409 | Stale version, archived parent, constraint, duplicate or inconsistent configuration |
| 422 | Invalid input, unknown field or malformed reference |
| 429 | Over five attempts per username or 30 per IP in 15 minutes; `Retry-After: 900` |
| 503 | Missing/unavailable database, or missing migration for readiness |

Private responses, including errors, use `Cache-Control: no-store`. Successful login clears username attempts but still counts toward the IP limit. Errors expose no password or SQL parameters.

## Public routes {#routes-publiques}

`GET /api/v1/health` returns `{"status":"ok"}` for a responding process. `/api/v1/health/ready` checks PostgreSQL and expected Alembic revision: 200/503 without connection details. Docker uses readiness.

Home, library and all application HTML shells, favicon/assets/documentation, `/api/docs` and `/api/openapi.json` are public. Shells contain no private data. Unknown paths remain 404 without HTML fallback. `/documentation` redirects to `/documentation/`.

## Duplicate and bulk actions {#dupliquer-et-agir-sur-un-lot}

`POST /tasks/{id}/duplicate` takes expected version and returns a 201 `TaskOutput`. Source and parents must be active. Copies preserve title, description, priority, labels, due date and recurrence, but have independent UUID, creation/update dates and history. They are open, unarchived, version 1, recurrence count zero. Preserve an open source status or choose the first open status, then append. No completion event is copied.

`POST /tasks/bulk` is discriminated by `action`, with 1–500 distinct `{id,expected_version}` task references. A 200 returns task outputs in request order. **One transaction** covers every change/event; even a failure on the last task rolls back the entire batch.

| Action | Additional fields | Behavior |
| --- | --- | --- |
| reschedule | Required due date or null | Preserve recurrence/count/state. Null forbidden for recurring tasks; bounds/exclusions apply |
| move | Workspace, optional/null section | Append in supplied order; preserve statuses within workspace, choose first same-type status between workspaces; labels match names, completion dates remain |
| archive | None | Reversible removal; preserve dates/rules/count/events; restore individually or in bulk |
| complete / reopen | None | Individual lifecycle rules; already-satisfied states unchanged; one occurrence per recurring task |
| duplicate | None | Copies in source order; sources unchanged |
| restore | None | Restore individually archived tasks with dates/status/events; archived parent conflicts the whole batch |
| priority | Integer 1–4 | Common priority |
| status | `status_ids: {workspace_uuid: status_uuid}` | Exactly one entry per represented workspace; normal completion/recurrence transitions |
| labels | `operation: add/remove`, `label_ids: {workspace_uuid: [label_uuid,…]}` | Exactly one entry per workspace, empty lists allowed; same-workspace labels; union/removal preserves others; max 100 per task |

Fields belonging to another action are rejected. All versions are checked before processing; internal reorder changes create no false conflicts. Use returned versions for later mutations. Normal 401/403/404/409/422 rules apply; none justify silently replacing a version and retrying.

Authenticated examples:

```python
source = client.get(f"/tasks/{task_id}").json()
response = client.post(f"/tasks/{task_id}/duplicate", json={
    "expected_version": source["version"],
})
response.raise_for_status()
copy = response.json()
response = client.post("/tasks/bulk", json={
    "action": "reschedule",
    "tasks": [{"id": t["id"], "expected_version": t["version"]}
              for t in [source, copy]],
    "due_date": "2026-12-15",
})
response.raise_for_status()
planned = response.json()
response = client.post("/tasks/bulk", json={
    "action": "move", "workspace_id": destination_id, "section_id": None,
    "tasks": [{"id": t["id"], "expected_version": t["version"]}
              for t in planned],
})
response.raise_for_status()
response = client.post("/tasks/bulk", json={
    "action": "archive",
    "tasks": [{"id": t["id"], "expected_version": t["version"]}
              for t in response.json()],
})
response.raise_for_status()
```

```python
# After reading current versions, using the same authenticated client:
selected = [source, copy]
refs = [{"id": t["id"], "expected_version": t["version"]} for t in selected]
response = client.post("/tasks/bulk", json={
    "action": "labels", "tasks": refs, "operation": "add",
    "label_ids": {str(workspace_id): [str(label_id)]},
})
response.raise_for_status()
updated = response.json()
response = client.post("/tasks/bulk", json={
    "action": "complete",
    "tasks": [{"id": t["id"], "expected_version": t["version"]} for t in updated],
})
response.raise_for_status()
```

Global views use existing contracts: search without workspace spans all workspaces; completed false/true selects open/completed; due none selects undated; archived true selects archives. Workspace/priority/label refine results under the same ownership/pagination rules.

## Sport {#sport}

`/api/v1/sport` exposes exercises, programs, training/sets/rest, settings, body measurements/statistics. See [contracts and client example](sport-api.md). Shared activation covers the entire router; owners isolate private objects.

## Response language {#langue-des-reponses}

Session also exposes locale. Account preference takes precedence over `Accept-Language`; anonymous requests negotiate fr/en with French fallback. Private responses carry `Content-Language`, `Vary: Accept-Language, Cookie`, no-store. Codes/identifiers remain language-independent.

HTTP errors use `{detail,code}`; structural 422 uses `detail:[{loc,type,code,msg}]` without input values. `/scheduling/parse` recognizes account-language vocabulary, e.g. `Read every Monday and Thursday for three times`, with identical RRULEs, validation, protections and Unicode offsets. Numeric dates remain day/month/year; ISO is accepted. See [language contracts](internationalisation.md#api-independante-de-linterface).

## Tracking and integrations {#suivi-et-integrations}

[Tracking contracts](tracking-api.md) cover definitions, order, archive/restore, settings, periods, entries/corrections, calendar/statistics/achievements. [Metrics discovery](integrations.md) covers sources, filter search and evaluation. All writes and POST evaluations require shared CSRF.

## Progression per application {#progression-par-application}

`/api/v1/progression` exposes earned points, levels, titles, streaks, quests and preferences from the [user guide](progression.md). Session is always required; owner never comes from input. Writes require allowed origin/CSRF. Responses use account language.

| Method/path after `/api/v1/progression` | Contract |
| --- | --- |
| `GET /` (also without trailing slash) | Enabled-app summaries: XP, level 1–100, title, current/next threshold, progress 0–1, ten titles, streaks, active days, current pause, three nearby quests, base XP and localized rules |
| `GET /{application_id}` | Same summary; disabled 403, unknown/no provider 404 |
| `GET /{application_id}/quests` | state all/available/earned, category, q max 120, offset 0–100000, limit 1–100/default 60; paginated envelope |
| `GET /{application_id}/history` | Date/ID descending, offset 0–100000, limit 1–100/default 20; paginated envelope |
| `GET /settings` | timezone, per-app usage_days/exclude_weekends, vacations, version (0 if implicit) |
| `PUT /settings` | Same settings with expected_version instead of version; concurrent winner → 409 |

Quests sort unfinished first, then descending progress ratio, target and identifier. Search uses localized name/description. Fields are `id,name,description,category,target,progress,ratio,xp,earned_at` nullable. Titles supply level/name/cumulative XP/earned. At level 100, next threshold is null and progress is 1.

Journal entries contain ID, activity/quest kind, localized label, XP, activity `occurred_at`, recording `recorded_at` and imported flag. Imported quest unlocks use import time, not invented historical dates.

Eligible business API actions award progress in the same transaction. No client route accepts an XP amount; reads award nothing. Shared preferences remain accessible with Tracking disabled, although their UI is in Tracking. Disabled-app private details stay denied without unmounting the consuming Tracking app.

After creating a session:

```bash
curl -b cookies.txt https://life.thibault-leveau.com/api/v1/progression/tasks
curl -b cookies.txt 'https://life.thibault-leveau.com/api/v1/progression/tasks/quests?state=available&limit=20'
curl -b cookies.txt 'https://life.thibault-leveau.com/api/v1/progression/tasks/history?limit=20&offset=0'
curl -b cookies.txt https://life.thibault-leveau.com/api/v1/progression/settings
# Replace 0 with the version read before editing.
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -H 'Content-Type: application/json' \
  -X PUT https://life.thibault-leveau.com/api/v1/progression/settings \
  -d '{"expected_version":0,"timezone":"Europe/Paris","usage_days":{"tasks":[0,1,2,3,4],"sport":[0,2,4],"tracking":[6],"okr":[4]},"vacations":[{"start":"2026-12-21","end":"2026-12-27"}]}'
```

`usage_days` maps each application to **1–7 distinct integers**, 0 Monday through 6 Sunday, returned sorted. Missing app entries use historical exclude_weekends (true: weekdays; false/absent: every day). Explicit calendars win, even when the old flag excludes weekends. Summaries expose resolved usage_days; their exclude_weekends indicates whether neither Saturday nor Sunday is scheduled.

Supplying usage_days replaces the entire map: read and resend other applications to retain them. Empty map restores historical/default calendars. **Omitting usage_days preserves existing explicit calendars**, protecting older clients; other fields retain replacement semantics. Empty day lists, duplicates, booleans, fractions, numeric strings and out-of-range days return 422. Up to 50 known provider applications, including disabled ones, are accepted; reactivation preserves settings.

Unknown fields, invalid timezone/application IDs, non-strict booleans, dates outside 2000–2100, reversed/overlapping vacations or more than 100 intervals return 422. Missing/expired session 401, invalid CSRF 403. Rule changes recalculate streaks without rewriting earned rewards. See [data](donnees.md#donnees-de-progression), [backups](sauvegardes.md#migration-0010-progression).

## OKR Goals {#objectifs-okr}

`/api/v1/okr` exposes objectives, key results, order/status, archives, quarterly history/timezone with shared version/protection rules. Shared providers expose metrics/progression. See [OKR HTTP examples](okr-api.md).

## Recipes and shopping {#recettes-et-courses}

`recipes` supplies bilingual ingredients, scalable recipes, lists/templates, import/combination, purchases, copies, archives/history. See [contracts/errors/examples](recipes-api.md). Progression and four metrics use shared APIs.

## General settings

The HTML route `/settings` composes [existing preferences](settings.md#api-and-storage) without a new data endpoint. Its sections use account, progression, agenda/view, Sport, Tracking and OKR APIs. Contracts, validation, owners, CSRF, versions and backup rules remain unchanged. Legacy application URLs with `?tab=settings` redirect to `/settings?application=<id>`.
