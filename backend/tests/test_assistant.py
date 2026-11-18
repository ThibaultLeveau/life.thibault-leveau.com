"""Exercise real assistant persistence, authorization, streaming and atomic receipts."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event
from uuid import UUID, uuid4

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import func, select

from life_app.core.database import utcnow
from life_app.platform.assistant import credentials, execution, service
from life_app.platform.assistant import models as m
from life_app.platform.assistant import schemas as s
from life_app.platform.assistant.providers import Response
from life_app.platform.auth.models import LoginSession, User

TOKEN = "sk-synthetic-assistant-private-token"


@pytest.fixture
def client(app, authenticated_client):
    app.state.settings.assistant_encryption_keys = SecretStr(Fernet.generate_key().decode())
    result = authenticated_client.put(
        "/api/v1/assistant/settings",
        json={"provider": "openai", "model": "synthetic-model", "api_token": TOKEN},
    )
    assert result.status_code == 200, result.text
    return authenticated_client


def conversation(client):
    response = client.post("/api/v1/assistant/conversations", json={})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def admitted(app, client, content="Créer mon espace"):
    id = conversation(client)
    with app.state.sessions() as db:
        user = db.scalar(select(User).where(User.username == "alice").with_for_update())
        login = db.scalar(select(LoginSession).where(LoginSession.user_id == user.id))
        row, created = service.new_run(
            db,
            user,
            db.get(m.Conversation, UUID(id)),
            s.SendMessage(content=content, request_id=uuid4()),
            login.token_hash,
        )
        assert created
        db.commit()
        return row.id, id


def events(response):
    assert response.status_code == 200, response.text
    return [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith("data:")]


class ScriptedSession:
    """Model substitute only; the actual dispatcher, apps and database remain real."""

    created = []
    block = None
    release = None

    def __init__(self, provider, model, token, instructions, messages):
        assert token == TOKEN
        assert TOKEN not in instructions
        self.instructions = instructions
        self.messages = messages
        self.turn = 0
        self.results = []
        self.created.append(self)

    def respond(self, tools):
        self.turn += 1
        if self.block and "conversation coordinator" in self.instructions:
            self.block.set()
            assert self.release.wait(10)
        names = {item["name"] for item in tools}
        call = None
        if "delegate_tasks" in names and self.turn == 1:
            call = ("delegate_tasks", {"task": "Créer un espace Projet IA"})
        elif "load_tools" in names and self.turn == 1:
            call = ("load_tools", {"names": ["create_workspace"]})
        elif "create_workspace" in names and self.turn == 2:
            call = ("create_workspace", {"arguments": {"payload": {"name": "Projet IA"}}})
        if call:
            return Response(
                calls=[{"id": str(uuid4()), "name": call[0], "arguments": json.dumps(call[1])}]
            )
        text = "Votre espace est créé." if "delegate_tasks" in names else "Espace enregistré."
        yield text[:10]
        yield text[10:]
        return Response(text=text)

    def tool_results(self, calls, results):
        self.results.extend(results)


def test_settings_encrypt_owner_binding_rotation_and_no_secret_reads(app, client):
    output = client.get("/api/v1/assistant/settings")
    assert output.json()["configured"]
    assert TOKEN not in output.text
    with app.state.sessions() as db:
        row = db.scalar(select(m.AssistantSettings))
        assert TOKEN not in row.ciphertext
        assert credentials.decrypt(app.state.settings, row) == TOKEN
        old_key = app.state.settings.assistant_encryption_keys.get_secret_value()
        app.state.settings.assistant_encryption_keys = SecretStr(
            Fernet.generate_key().decode() + "," + old_key
        )
        assert credentials.decrypt(app.state.settings, row) == TOKEN
        row.user_id = uuid4()
        with pytest.raises(HTTPException):
            credentials.decrypt(app.state.settings, row)
    changed = client.put("/api/v1/assistant/settings", json={"provider": "anthropic"})
    assert changed.json()["configured"] is False
    assert changed.json()["model"] == ""


@pytest.mark.parametrize("locale", ["fr", "en"])
def test_stream_delegates_to_scoped_agent_and_persists_actual_result(app, client, locale):
    assert client.put("/api/v1/preferences", json={"locale": locale}).status_code == 200
    ScriptedSession.created = []
    app.state.assistant_provider_factory = ScriptedSession
    id = conversation(client)
    payload = {"content": "Crée un espace Projet IA", "request_id": str(uuid4())}
    response = client.post(f"/api/v1/assistant/conversations/{id}/messages", json=payload)
    output = events(response)
    assert output[-1]["type"] == "done", output
    assert not [item for item in output if item["type"] == "error"], output
    capability = next(
        item
        for item in client.get("/api/v1/assistant/capabilities").json()
        if item["application_id"] == "tasks" and item["name"] == "create_workspace"
    )
    assert capability["label"] in [item["text"] for item in output if item["type"] == "status"]
    detail = client.get(f"/api/v1/assistant/conversations/{id}").json()
    assert len(detail["messages"]) == 2
    assistant = next(item for item in detail["messages"] if item["role"] == "assistant")
    assert assistant["content"] == "Votre espace est créé."
    assert assistant["status"] == "complete"
    assert assistant["snippets"][0]["phase"] == "result"
    spaces = client.get("/api/v1/workspaces").json()
    assert len(spaces) == 1 and spaces[0]["name"] == "Projet IA"
    assert assistant["snippets"][0]["data"]["entity"]["id"] == spaces[0]["id"]
    calls_before = len(ScriptedSession.created)
    replay = events(client.post(f"/api/v1/assistant/conversations/{id}/messages", json=payload))
    assert replay == output
    assert len(ScriptedSession.created) == calls_before
    assert len(client.get("/api/v1/workspaces").json()) == 1
    conflict = client.post(
        f"/api/v1/assistant/conversations/{id}/messages",
        json={**payload, "content": "Autre demande"},
    )
    assert conflict.status_code == 409


def test_preview_is_read_only_confirmation_is_atomic_and_replay_safe(app, client):
    run_id, id = admitted(app, client)
    result = execution.execute(
        app,
        run_id,
        1,
        "tasks",
        "create_workspace",
        {"payload": {"name": "À valider"}},
        propose=True,
    )
    assert result["status"] == "preview"
    assert client.get("/api/v1/workspaces").json() == []
    confirmed = client.post(f"/api/v1/assistant/operations/{result['operation_id']}/confirm")
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["status"] == "complete"
    again = client.post(f"/api/v1/assistant/operations/{result['operation_id']}/confirm")
    assert again.json() == confirmed.json()
    assert len(client.get("/api/v1/workspaces").json()) == 1
    card = client.get(f"/api/v1/assistant/conversations/{id}").json()["messages"][-1]["snippets"][0]
    assert card["phase"] == "result"


def test_disabled_app_session_revocation_and_scope_are_checked_at_execution(app, client):
    run_id, _ = admitted(app, client)
    client.put("/api/v1/applications/tasks", json={"enabled": False})
    with pytest.raises(HTTPException) as disabled:
        execution.execute(
            app, run_id, 1, "tasks", "create_workspace", {"payload": {"name": "Refus"}}
        )
    assert disabled.value.status_code == 403
    client.put("/api/v1/applications/tasks", json={"enabled": True})
    with pytest.raises(HTTPException) as wrong_scope:
        execution.execute(app, run_id, 1, "tasks", "create_recipe", {})
    assert wrong_scope.value.status_code == 404
    client.delete("/api/v1/auth/session")
    with pytest.raises(HTTPException) as revoked:
        execution.execute(
            app, run_id, 1, "tasks", "create_workspace", {"payload": {"name": "Refus"}}
        )
    assert revoked.value.status_code == 401


def test_provider_wait_does_not_hold_owner_lock_and_logout_stops_next_action(app, client):
    block, release = Event(), Event()

    class SlowSession(ScriptedSession):
        pass

    SlowSession.block, SlowSession.release = block, release
    app.state.assistant_provider_factory = SlowSession
    id = conversation(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        stream = pool.submit(
            client.post,
            f"/api/v1/assistant/conversations/{id}/messages",
            json={"content": "Créer Projet IA", "request_id": str(uuid4())},
        )
        assert block.wait(5)
        try:
            write = pool.submit(client.post, "/api/v1/workspaces", json={"name": "Concurrent"})
            assert write.result(timeout=3).status_code == 201
            logout = pool.submit(client.delete, "/api/v1/auth/session")
            assert logout.result(timeout=3).status_code == 204
        finally:
            release.set()
        output = events(stream.result(timeout=10))
    assert any(item.get("code") == "assistant.session_expired" for item in output), output
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.Operation)) == 0


def test_memory_edit_forget_invalidates_context_and_does_not_erase_history(app, client):
    memory = client.post(
        "/api/v1/assistant/memories",
        json={"content": "Je travaille sur Atlas", "category": "projects"},
    )
    assert memory.status_code == 201
    run_id, id = admitted(app, client, "Un message à conserver dans l’historique")
    updated = client.patch(
        f"/api/v1/assistant/memories/{memory.json()['id']}",
        json={"content": "Je travaille sur Orion"},
    )
    assert updated.status_code == 200
    with pytest.raises(HTTPException) as outdated:
        execution.execute(app, run_id, 1, "tasks", "list_workspaces", {})
    assert outdated.value.status_code == 409
    assert len(client.get(f"/api/v1/assistant/conversations/{id}").json()["messages"]) == 2
    assert client.delete(f"/api/v1/assistant/memories/{memory.json()['id']}").status_code == 204
    assert client.get("/api/v1/assistant/memories").json()["items"] == []
    forbidden = client.post("/api/v1/assistant/memories", json={"content": TOKEN})
    assert forbidden.status_code == 422


def test_private_endpoints_are_owner_scoped_and_csrf_protected(app, client):
    id = conversation(client)
    memory = client.post("/api/v1/assistant/memories", json={"content": "Un fait personnel"}).json()
    with TestClient(app) as other:
        login = other.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        other.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        assert other.get(f"/api/v1/assistant/conversations/{id}").status_code == 404
        assert (
            other.patch(
                f"/api/v1/assistant/memories/{memory['id']}", json={"content": "Écrasement"}
            ).status_code
            == 404
        )
        assert other.get("/api/v1/assistant/conversations").json()["items"] == []
        assert other.get("/api/v1/assistant/settings").json()["configured"] is False
    csrf = client.headers.pop("X-CSRF-Token")
    assert client.post("/api/v1/assistant/conversations", json={}).status_code == 403
    client.headers["X-CSRF-Token"] = csrf


def test_cancelled_and_expired_runs_cannot_mutate(app, client):
    run_id, _ = admitted(app, client)
    assert client.post(f"/api/v1/assistant/runs/{run_id}/cancel").json()["ok"]
    with pytest.raises(HTTPException):
        execution.execute(app, run_id, 1, "tasks", "create_workspace", {"payload": {"name": "Non"}})
    with app.state.sessions() as db:
        run = db.get(m.Run, run_id)
        run.cancelled = False
        run.created_at = utcnow() - timedelta(hours=1)
        db.commit()
    with pytest.raises(HTTPException):
        execution.execute(app, run_id, 1, "tasks", "create_workspace", {"payload": {"name": "Non"}})
    assert client.get("/api/v1/workspaces").json() == []


@pytest.mark.parametrize(
    ("action", "arguments", "path", "changed"),
    [
        ("save_preferences", {"payload": {"theme": "dark"}}, "/preferences", {"theme": "light"}),
        (
            "set_application",
            {"application_id": "sport", "enabled": True},
            "/applications/sport",
            {"enabled": True},
        ),
    ],
)
def test_common_previews_refuse_to_overwrite_changed_settings(
    app, client, action, arguments, path, changed
):
    run_id, _ = admitted(app, client)
    preview = execution.execute(app, run_id, 1, "lifeos", action, arguments, propose=True)
    assert preview["status"] == "preview"
    assert client.put("/api/v1" + path, json=changed).status_code == 200
    confirm = client.post(f"/api/v1/assistant/operations/{preview['operation_id']}/confirm")
    assert confirm.status_code == 409
    assert confirm.json()["code"] == "assistant.preview_changed"


def test_history_search_archive_restore_and_delete_are_owner_scoped(app, client):
    ScriptedSession.created = []
    app.state.assistant_provider_factory = ScriptedSession
    id = conversation(client)
    payload = {"content": "Crée un espace 100%_Atlas", "request_id": str(uuid4())}
    events(client.post(f"/api/v1/assistant/conversations/{id}/messages", json=payload))
    assert (
        client.get("/api/v1/assistant/conversations", params={"q": "100%_Atlas"}).json()["total"]
        == 1
    )
    assert (
        client.get("/api/v1/assistant/conversations", params={"q": "100X_Atlas"}).json()["total"]
        == 0
    )
    path = f"/api/v1/assistant/conversations/{id}"
    assert client.patch(path, json={"archived": True, "title": "Archives Atlas"}).status_code == 200
    assert client.get("/api/v1/assistant/conversations").json()["total"] == 0
    assert client.get("/api/v1/assistant/conversations?archived=true").json()["total"] == 1
    assert (
        client.post(path + "/messages", json={**payload, "request_id": str(uuid4())}).status_code
        == 409
    )
    assert len(client.get(path).json()["messages"]) == 2
    assert client.patch(path, json={"archived": False}).status_code == 200
    assert client.delete(path).status_code == 204
    assert client.get(path).status_code == 404
    assert len(client.get("/api/v1/workspaces").json()) == 1  # History deletion preserves work.


def test_memory_is_sourced_relevant_across_conversations_and_forgettable(app, client):
    from life_app.platform.assistant.runtime import Runtime

    quote = "Je travaille sur le projet Atlas pour mon portfolio."

    class MemorySession(ScriptedSession):
        def respond(self, tools):
            yield ""
            return Response(
                calls=[
                    {
                        "id": "remember_one",
                        "name": "remember",
                        "arguments": json.dumps(
                            {
                                "content": "Invented profession.",
                                "source_quote": quote,
                                "category": "projects",
                                "sensitive": False,
                            }
                        ),
                    }
                ]
            )

    app.state.assistant_provider_factory = MemorySession
    run_id, first = admitted(app, client, quote)
    list(Runtime(app, run_id).memory_agent("Retenir mon projet"))
    saved = client.get("/api/v1/assistant/memories").json()["items"][0]
    assert saved["content"] == saved["source_excerpt"] == quote
    assert saved["source_conversation_id"] == first
    assert saved["source_message_id"]
    with app.state.sessions() as db:
        run = db.get(m.Run, run_id)
        run.status = "complete"
        user = db.get(User, run.user_id)
        for number in range(45):
            service.save_memory(db, user, s.MemoryInput(content=f"Préférence quelconque {number}"))
        db.commit()
    next_run, _ = admitted(app, client, "Quel est mon projet Atlas ?")
    context = Runtime(app, next_run).context
    assert quote in [item["content"] for item in context["memories"]]
    assert len(context["memories"]) <= 40
    assert client.delete(f"/api/v1/assistant/memories/{saved['id']}").status_code == 204
    with pytest.raises(HTTPException):
        Runtime(app, next_run)  # A running turn cannot reuse forgotten context.
    assert len(client.get(f"/api/v1/assistant/conversations/{first}").json()["messages"]) == 2


@pytest.mark.parametrize(
    "quote,sensitive",
    [("Invented personal fact", False), ("Je suis malade depuis plusieurs années.", True)],
)
def test_memory_agent_rejects_unsourced_or_unrequested_sensitive_facts(
    app, client, quote, sensitive
):
    from life_app.platform.assistant.runtime import Runtime

    class UnsafeMemory(ScriptedSession):
        def respond(self, tools):
            yield ""
            return Response(
                calls=[
                    {
                        "id": "one",
                        "name": "remember",
                        "arguments": json.dumps(
                            {
                                "content": quote,
                                "source_quote": quote,
                                "category": "personal",
                                "sensitive": sensitive,
                            }
                        ),
                    }
                ]
            )

    app.state.assistant_provider_factory = UnsafeMemory
    run_id, _ = admitted(app, client, "Je suis malade depuis plusieurs années.")
    list(Runtime(app, run_id).memory_agent("Retenir un fait"))
    assert client.get("/api/v1/assistant/memories").json()["total"] == 0


def test_model_budget_stops_before_starting_an_extra_provider_request(app, client):
    from life_app.platform.assistant.providers import ProviderError
    from life_app.platform.assistant.runtime import Runtime

    run_id, _ = admitted(app, client)
    runtime = Runtime(app, run_id)
    runtime.calls = app.state.settings.assistant_max_model_calls

    class NeverCalled:
        def respond(self, tools):
            pytest.fail("Provider was called after its budget was spent")

    with pytest.raises(ProviderError, match="budget_reached"):
        list(runtime.sample(NeverCalled(), [], False))
