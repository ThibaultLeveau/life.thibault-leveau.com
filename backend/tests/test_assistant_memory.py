"""Memory consent and correction invalidate unsafe context before any further action."""

import json
from uuid import UUID

import pytest
from fastapi import HTTPException
from test_assistant import ScriptedSession, admitted
from test_assistant import client as client

from life_app.apps.life_ai import execution
from life_app.apps.life_ai import models as m
from life_app.apps.life_ai.runtime import Runtime
from life_app.platform.assistant.providers import Response


def memory_session(quote, *, sensitive=False, replace_id=None, category="personal"):
    class MemorySession(ScriptedSession):
        def respond(self, tools):
            yield ""
            return Response(
                calls=[
                    {
                        "id": "memory_one",
                        "name": "remember",
                        "arguments": json.dumps(
                            {
                                "content": quote,
                                "source_quote": quote,
                                "category": category,
                                "sensitive": sensitive,
                                "replace_id": replace_id,
                            }
                        ),
                    }
                ]
            )

    return MemorySession


@pytest.mark.parametrize("sensitive", [False, True])
@pytest.mark.parametrize(
    "refusal",
    [
        "Ne mémorise pas cette information : ",
        "Ne retiens pas cette information : ",
        "Do not remember this information: ",
        "Don't save this in memory: ",
    ],
)
def test_explicit_refusal_prevents_memory_even_if_model_requests_it(
    app, client, refusal, sensitive
):
    quote = "Je suis malade depuis plusieurs années."
    app.state.assistant_provider_factory = memory_session(quote, sensitive=sensitive)
    run_id, _ = admitted(app, client, refusal + quote)
    list(Runtime(app, run_id).memory_agent("Retenir ce fait"))
    assert client.get("/api/v1/assistant/memories").json()["total"] == 0


@pytest.mark.parametrize(
    ("quote", "category"),
    [
        ("Je souffre de diabète.", "profile"),
        ("I have diabetes.", "profile"),
        ("Je pars souvent en promenade.", "personal"),
    ],
)
def test_conservative_guard_does_not_trust_model_sensitive_false(app, client, quote, category):
    app.state.assistant_provider_factory = memory_session(quote, category=category)
    run_id, _ = admitted(app, client, quote)
    list(Runtime(app, run_id).memory_agent("Retenir ce fait"))
    assert client.get("/api/v1/assistant/memories").json()["total"] == 0


def test_positive_explicit_request_allows_sourced_sensitive_memory(app, client):
    quote = "I have diabetes."
    app.state.assistant_provider_factory = memory_session(quote, sensitive=True)
    run_id, conversation_id = admitted(app, client, "Remember that " + quote)
    list(Runtime(app, run_id).memory_agent("Remember this requested fact"))
    memories = client.get("/api/v1/assistant/memories").json()
    assert memories["total"] == 1
    assert memories["items"][0]["content"] == memories["items"][0]["source_excerpt"] == quote
    assert memories["items"][0]["source_conversation_id"] == conversation_id


def test_automatic_memory_correction_invalidates_run_before_further_provider_or_business_work(
    app, client
):
    previous = client.post("/api/v1/assistant/memories", json={"content": "Je vis à Lyon."}).json()
    quote = "Je vis maintenant à Paris."
    app.state.assistant_provider_factory = memory_session(quote, replace_id=previous["id"])
    run_id, conversation_id = admitted(app, client, "Mémorise cette correction : " + quote)
    with app.state.sessions() as db:
        conversation = db.get(m.Conversation, UUID(conversation_id))
        conversation.summary = "La personne habite Lyon."
        db.commit()
    runtime = Runtime(app, run_id)
    assert "Lyon" in runtime.summary
    list(runtime.memory_agent("Corriger le lieu de vie"))

    memories = client.get("/api/v1/assistant/memories").json()
    assert memories["total"] == 1
    assert memories["items"][0]["id"] == previous["id"]
    assert memories["items"][0]["content"] == quote
    assert memories["items"][0]["source_excerpt"] == quote
    assert memories["items"][0]["source_conversation_id"] == conversation_id
    with app.state.sessions() as db:
        run = db.get(m.Run, run_id)
        config = db.get(m.AssistantSettings, run.user_id)
        assert run.memory_version < config.memory_version
        conversation = db.get(m.Conversation, UUID(conversation_id))
        assert conversation.summary == "" and conversation.summary_until is None

    with pytest.raises(HTTPException) as stale:
        runtime.check(True)
    assert stale.value.status_code == 409
    assert stale.value.detail.code == "assistant.context_changed"
    with pytest.raises(HTTPException):
        execution.execute(
            app,
            run_id,
            1,
            "tasks",
            "create_workspace",
            {"payload": {"name": "Would use stale context"}},
        )
    assert client.get("/api/v1/workspaces").json() == []
