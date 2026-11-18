"""Terminal runs survive disconnects, cancellation, recovery and repeated delivery."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event

import pytest
from sqlalchemy import select
from test_assistant import TOKEN, admitted, events
from test_assistant import client as client

from life_app.apps.life_ai import execution, runtime
from life_app.apps.life_ai import models as m
from life_app.core.database import utcnow
from life_app.platform.assistant.providers import Response


def journal(app, run_id):
    with app.state.sessions() as db:
        return [
            row.data
            for row in db.scalars(
                select(m.RunEvent).where(m.RunEvent.run_id == run_id).order_by(m.RunEvent.sequence)
            )
        ]


def replay_payload(app, run_id):
    with app.state.sessions() as db:
        run = db.get(m.Run, run_id)
        user_message = db.scalar(
            select(m.Message).where(
                m.Message.conversation_id == run.conversation_id, m.Message.role == "user"
            )
        )
        return {"request_id": str(run.request_id), "content": user_message.content}


def assert_terminal(app, run_id, status):
    with app.state.sessions() as db:
        run = db.get(m.Run, run_id)
        assert run.status == status
        assert db.get(m.Message, run.message_id).status == status
    rows = journal(app, run_id)
    assert sum(row["type"] == "done" for row in rows) == 1
    assert rows[-2]["type"] == "message"
    assert rows[-2]["message"]["status"] == status
    assert rows[-1]["type"] == "done"
    assert [row["sequence"] for row in rows] == list(range(1, len(rows) + 1))
    return rows


def test_close_before_provider_persists_terminal_events_and_replays_receipts(app, client):
    run_id, conversation_id = admitted(app, client)
    result = execution.execute(
        app, run_id, 1, "tasks", "create_workspace", {"payload": {"name": "Déjà enregistré"}}
    )
    stream = runtime.stream(app, run_id)
    assert json.loads(next(stream)[5:])["type"] == "status"
    stream.close()
    rows = assert_terminal(app, run_id, "interrupted")
    assert rows[-2]["message"]["snippets"][0]["operation_id"] == result["operation_id"]
    replayed = events(
        client.post(
            f"/api/v1/assistant/conversations/{conversation_id}/messages",
            json=replay_payload(app, run_id),
        )
    )
    assert replayed == rows
    assert len(client.get("/api/v1/workspaces").json()) == 1


def test_close_after_persisted_delta_does_not_append_it_twice(app, client, monkeypatch):
    run_id, _ = admitted(app, client)
    text = "Une réponse partielle. " * 8

    class PartialRuntime:
        def __init__(self, *_):
            pass

        def run(self):
            yield {"type": "delta", "text": text}
            pytest.fail("The closed stream must not advance the provider")

    monkeypatch.setattr(runtime, "Runtime", PartialRuntime)
    stream = runtime.stream(app, run_id)
    next(stream)
    assert json.loads(next(stream)[5:])["text"] == text
    stream.close()
    rows = assert_terminal(app, run_id, "interrupted")
    assert rows[-2]["message"]["content"] == text
    assert "".join(row["text"] for row in rows if row["type"] == "delta") == text


def test_cancel_is_immediate_and_late_provider_cannot_overwrite_terminal(app, client):
    entered, release = Event(), Event()

    class SlowSession:
        def __init__(self, provider, model, token, instructions, messages):
            assert token == TOKEN

        def respond(self, tools):
            entered.set()
            assert release.wait(10)
            if False:
                yield ""
            return Response(text="Trop tard")

    app.state.assistant_provider_factory = SlowSession
    run_id, conversation_id = admitted(app, client)
    with ThreadPoolExecutor(max_workers=1) as pool:
        stream = pool.submit(lambda: list(runtime.stream(app, run_id)))
        assert entered.wait(5)
        try:
            assert client.post(f"/api/v1/assistant/runs/{run_id}/cancel").status_code == 200
            rows = assert_terminal(app, run_id, "interrupted")
            detail = client.get(f"/api/v1/assistant/conversations/{conversation_id}").json()
            assert detail["messages"][-1]["status"] == "interrupted"
        finally:
            release.set()
        stream.result(timeout=10)
    assert assert_terminal(app, run_id, "interrupted") == rows
    assert client.post(f"/api/v1/assistant/runs/{run_id}/cancel").status_code == 200
    assert journal(app, run_id) == rows


@pytest.mark.parametrize("endpoint", ["conversation", "events"])
def test_polling_recovers_expired_run_from_creation_even_with_recent_events(app, client, endpoint):
    run_id, conversation_id = admitted(app, client)
    runtime.record_event(app, run_id, {"type": "status", "text": "Ancienne exécution"})
    with app.state.sessions() as db:
        run = db.get(m.Run, run_id)
        run.created_at = utcnow() - timedelta(
            seconds=app.state.settings.assistant_timeout_seconds + 31
        )
        run.updated_at = utcnow()
        db.commit()
    url = (
        f"/api/v1/assistant/conversations/{conversation_id}"
        if endpoint == "conversation"
        else f"/api/v1/assistant/runs/{run_id}/events"
    )
    assert client.get(url).status_code == 200
    rows = assert_terminal(app, run_id, "interrupted")
    assert events(client.get(f"/api/v1/assistant/runs/{run_id}/events")) == rows
    assert (
        events(
            client.post(
                f"/api/v1/assistant/conversations/{conversation_id}/messages",
                json=replay_payload(app, run_id),
            )
        )
        == rows
    )
    assert journal(app, run_id) == rows


def test_polling_keeps_unexpired_run_running(app, client):
    run_id, conversation_id = admitted(app, client)
    assert client.get(f"/api/v1/assistant/conversations/{conversation_id}").status_code == 200
    assert events(client.get(f"/api/v1/assistant/runs/{run_id}/events")) == []
    with app.state.sessions() as db:
        assert db.get(m.Run, run_id).status == "running"


@pytest.mark.parametrize("endpoint", ["conversation", "events", "replay"])
def test_restored_terminal_run_gets_missing_journal_snapshot(app, client, endpoint):
    run_id, conversation_id = admitted(app, client)
    runtime.record_event(app, run_id, {"type": "delta", "text": "Réponse avant restauration"})
    with app.state.sessions() as db:
        run = db.get(m.Run, run_id)
        run.status = "interrupted"
        run.cancelled = True
        db.get(m.Message, run.message_id).status = "interrupted"
        db.commit()
    if endpoint == "replay":
        response = client.post(
            f"/api/v1/assistant/conversations/{conversation_id}/messages",
            json=replay_payload(app, run_id),
        )
    else:
        response = client.get(
            f"/api/v1/assistant/conversations/{conversation_id}"
            if endpoint == "conversation"
            else f"/api/v1/assistant/runs/{run_id}/events"
        )
    assert response.status_code == 200
    rows = assert_terminal(app, run_id, "interrupted")
    assert rows[-2]["message"]["content"] == "Réponse avant restauration"
    if endpoint != "conversation":
        assert events(response) == rows


def test_concurrent_finalizers_publish_one_terminal_and_no_later_events(app, client):
    run_id, _ = admitted(app, client)

    def finish():
        with app.state.sessions() as db:
            result = runtime.finish_run(db, run_id, "complete", pending="Une seule réponse")
            db.commit()
            return result

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(finish) for _ in range(2)]
        [future.result(timeout=10) for future in futures]
    rows = assert_terminal(app, run_id, "complete")
    assert rows[-2]["message"]["content"] == "Une seule réponse"
    assert runtime.record_event(app, run_id, {"type": "delta", "text": "Trop tard"}) is None
    assert client.post(f"/api/v1/assistant/runs/{run_id}/cancel").status_code == 200
    assert journal(app, run_id) == rows
