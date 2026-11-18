# Assistant API

[Référence française](../assistant-api.md) · [User guide](assistant.md) · [OpenAPI](https://life.thibault-leveau.com/api/docs)

All routes use `/api/v1/assistant`. The shared session identifies the owner; mutations require the allowed origin and `X-CSRF-Token`. Inputs reject unknown fields and client-selected ownership. Business capabilities also require an enabled application.

## Routes and contracts

| Method and relative path | Behavior |
| --- | --- |
| `GET /settings` | `provider`, `model`, `configured`, `token_hint`, `memory_enabled`; no readable token |
| `PUT /settings` | Partial update: `provider` (`openai/anthropic/gemini`), `model`, `api_token`, `memory_enabled` |
| `POST /settings/test` | Calls the configured provider; returns `{ "ok": true }` on success |
| `GET /capabilities` | Enabled capabilities, `label` in the account language, JSON contracts, corresponding HTTP routes, mutation and confirmation flags |
| `GET /conversations` | Search `q` (160 characters), `archived=false`, `offset=0`, `limit=30` (1–100); `{ items, total }` |
| `POST /conversations` | Optional `{ "title": "" }`, maximum 160 characters; returns a conversation (201) |
| `GET /conversations/{id}` | Conversation and messages; `offset=0`, `limit=100` (1–200), `has_more` |
| `PATCH /conversations/{id}` | Nonempty `title` and/or boolean `archived` |
| `DELETE /conversations/{id}` | Delete (204); `forget_memories=false` preserves sourced memories |
| `POST /conversations/{id}/messages` | `{ "content": "…", "request_id": "UUID" }`; 1–12,000 characters; SSE stream |
| `GET /runs/{id}/events` | Replay persisted events after `after=0`; starts no action |
| `POST /runs/{id}/cancel` | Stop subsequent steps; `{ "ok": true }` |
| `POST /operations/{id}/confirm` | Confirm the saved operation; returns status, result and snippet |
| `GET /memories` | `offset=0`, `limit=100` (1–500); `{ items, total }` |
| `POST /memories` | `{ "content": "…", "category": "personal" }`; create a memory (201) |
| `PATCH /memories/{id}` | Replace `content` and optionally `category` |
| `DELETE /memories/{id}` | Forget one memory (204) |
| `DELETE /memories` | Forget all memories (204) |

Omitting `api_token` preserves it; `null` deletes it; a string must contain 10–4,096 characters. Changing provider clears the previous token and model. `model` accepts letters, digits, dot, dash, underscore and colon, up to 120 characters. Memories accept 1–1,000 characters and a 1–40-character category; an account can retain 500 memories. Known secret patterns are rejected, but this is not exhaustive secret detection.

Memory sources, dates and identifiers are assigned by the server. Messages contain `role`, `content`, `status`, `snippets`, `run_id` and creation time. Reply states are `running`, `complete`, `interrupted`, `failed`. Deleting a conversation cascades to its messages, runs, events and operations; the forgetting option separately controls memories.

Version 1 snippets retain each operation’s complete result in `data.entity`, the boolean `data.read_only` flag and, for previews, validated arguments. Reads, including discovery and LifeOS capabilities, remain in messages; their collapsed grouping is a frontend presentation. Confirmation replaces the same snippet ID in place. There is no SQL migration or confirmation contract change; business API pagination limits still apply. Decimal API quantities retain their precision; only their display is formatted.

## Streaming and idempotency

The POST returns `text/event-stream`. Each event is a JSON object in a `data:` line followed by a blank line, with `type`, `run_id` and `sequence`. Types are `status` (progress text), `delta` (partial text), `message` (message and snippets to reconcile), `error` (code), and `done` (completion). Reconcile messages and cards by identifier instead of appending duplicates.

Keep `request_id` for the same send intention. Repeating the same UUID, conversation and text replays events without executing tools again. Reusing the UUID with different content or a different conversation returns 409. A new request uses a new UUID. Replay is a snapshot of persisted events, not a model restart.

Operations have persistent `(run_id, step)` receipts and a fingerprint of normalized arguments. Business writes, history, progression and the receipt are atomic. Repeating a successful confirmation returns the existing receipt. Previews expire after 24 hours; changed business versions prevent confirmation. Stopping does not undo already committed changes.

Errors before streaming use normal HTTP responses. After streaming begins, inspect `error` events and the final message state; HTTP 200 does not mean every action succeeded. Examples: 401 session, 403 disabled application, 404 missing/inaccessible reference, 409 conflict/version/missing configuration/active run, 422 validation, 502 provider, and 503 unavailable encryption. Codes are stable; raw provider details are not exposed.

## Browser-independent example

Use a synthetic account with provider, model and token already configured. `httpx` is available in the development environment. This creates a real conversation and makes a billable provider request; the prompt asks for a read only.

```python
import getpass
import json
from uuid import uuid4

import httpx

with httpx.Client(base_url="http://127.0.0.1:8100/api/v1", timeout=240) as client:
    login = client.post("/auth/session", json={
        "username": input("Synthetic account: "), "password": getpass.getpass(),
    })
    login.raise_for_status()
    client.headers["X-CSRF-Token"] = login.json()["csrf_token"]
    created = client.post("/assistant/conversations", json={"title": "Acceptance read"})
    created.raise_for_status()
    conversation_id = created.json()["id"]
    request_id = str(uuid4())  # Keep this UUID to replay this same send.
    with client.stream("POST", f"/assistant/conversations/{conversation_id}/messages", json={
        "content": "List my enabled applications without changing anything.",
        "request_id": request_id,
    }) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if line.startswith("data: "):
                event = json.loads(line[6:])
                if event["type"] == "delta":
                    print(event["text"], end="", flush=True)
                elif event["type"] == "error":
                    print("\nError:", event["code"])
    result = client.get(f"/assistant/conversations/{conversation_id}")
    result.raise_for_status()
    print("\nStatus:", result.json()["messages"][-1]["status"])
```

Use HTTPS in production. Original business routes remain the reference API for objects, independently of AI generation. See [application contracts](evolution.md), [data](donnees.md) and [restoration](sauvegardes.md#migration-0015-assistant).
