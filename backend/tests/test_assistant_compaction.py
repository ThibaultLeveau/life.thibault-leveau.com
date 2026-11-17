"""Summaries only cover complete messages that were actually sent to the model."""

import json
from datetime import timedelta
from uuid import UUID

import pytest
from test_assistant import ScriptedSession, admitted
from test_assistant import client as client

from life_app.core.database import utcnow
from life_app.platform.assistant import models as m
from life_app.platform.assistant.providers import ProviderError, Response
from life_app.platform.assistant.runtime import Runtime


def history(app, client, contents):
    run_id, conversation_id = admitted(app, client, "Résume les décisions de cette conversation.")
    start = utcnow() - timedelta(hours=1)
    with app.state.sessions() as db:
        conversation = db.get(m.Conversation, UUID(conversation_id))
        conversation.summary = "Previously covered decisions."
        conversation.summary_until = start - timedelta(seconds=1)
        for index, content in enumerate(contents):
            db.add(
                m.Message(
                    user_id=conversation.user_id,
                    conversation_id=conversation.id,
                    role="user" if index % 2 else "assistant",
                    content=content,
                    created_at=start + timedelta(seconds=index),
                )
            )
        db.commit()
    return run_id, UUID(conversation_id), start - timedelta(seconds=1)


def summarizer(app, conversation_id, samples, *, fail_at=None):
    class SummarySession(ScriptedSession):
        def respond(self, tools):
            raw = self.messages[0]["content"]
            assert len(raw) <= 60000
            records = json.loads(raw)  # Every request contains complete JSON, including escapes.
            with app.state.sessions() as db:
                conversation = db.get(m.Conversation, conversation_id)
                watermark = conversation.summary_until
            samples.append((records, watermark))
            yield ""
            if len(samples) == fail_at:
                raise ProviderError("assistant.budget_reached")
            return Response(text=f"Summary after request {len(samples)}.")

    return SummarySession


def test_compaction_batches_all_old_messages_without_silently_truncating_history(app, client):
    contents = [f"decision-{number}: " + "x" * 12000 for number in range(20)]
    run_id, conversation_id, _ = history(app, client, contents)
    samples = []
    app.state.assistant_provider_factory = summarizer(app, conversation_id, samples)
    runtime = Runtime(app, run_id)
    expected = runtime.messages[:-10]
    last_covered = runtime.message_dates[-11]
    remaining = runtime.messages[-10:]
    list(runtime.compact())
    assert len(samples) > 1
    assert [message for batch, _ in samples for message in batch] == expected
    assert runtime.messages == remaining
    assert runtime.summary_until == last_covered
    with app.state.sessions() as db:
        assert db.get(m.Conversation, conversation_id).summary_until == last_covered


def test_compaction_splits_oversized_message_and_commits_watermark_only_after_all_parts(
    app, client
):
    content = 'Quoted "value"\n' * 8000
    run_id, conversation_id, previous = history(app, client, [content] + ["recent"] * 9)
    samples = []
    app.state.assistant_provider_factory = summarizer(app, conversation_id, samples)
    runtime = Runtime(app, run_id)
    last_covered = runtime.message_dates[0]
    list(runtime.compact())
    assert len(samples) > 1
    assert "".join(message["content"] for batch, _ in samples for message in batch) == content
    assert all(watermark == previous for _, watermark in samples)
    assert runtime.summary_until == last_covered
    assert len(runtime.messages) == 10


def test_interrupted_oversized_message_keeps_previous_summary_and_all_unprocessed_context(
    app, client
):
    content = 'Quoted "value"\n' * 8000
    run_id, conversation_id, previous = history(app, client, [content] + ["recent"] * 9)
    samples = []
    app.state.assistant_provider_factory = summarizer(app, conversation_id, samples, fail_at=2)
    runtime = Runtime(app, run_id)
    original = runtime.messages.copy()
    with pytest.raises(ProviderError, match="budget_reached"):
        list(runtime.compact())
    assert runtime.messages == original
    assert runtime.summary_until == previous
    assert runtime.summary == "Previously covered decisions."
    with app.state.sessions() as db:
        conversation = db.get(m.Conversation, conversation_id)
        assert conversation.summary_until == previous
        assert conversation.summary == "Previously covered decisions."
    resumed_samples = []
    app.state.assistant_provider_factory = summarizer(app, conversation_id, resumed_samples)
    list(Runtime(app, run_id).compact())
    assert (
        "".join(message["content"] for batch, _ in resumed_samples for message in batch) == content
    )


def test_interrupted_batch_keeps_completed_checkpoint_and_retries_only_uncovered_messages(
    app, client
):
    contents = [f"decision-{number}: " + "x" * 12000 for number in range(20)]
    run_id, conversation_id, _ = history(app, client, contents)
    samples = []
    app.state.assistant_provider_factory = summarizer(app, conversation_id, samples, fail_at=2)
    runtime = Runtime(app, run_id)
    expected = runtime.messages[:-10]
    dates = runtime.message_dates.copy()
    with pytest.raises(ProviderError, match="budget_reached"):
        list(runtime.compact())
    covered = samples[0][0]
    assert runtime.summary_until == dates[len(covered) - 1]
    assert runtime.summary == "Summary after request 1."
    assert runtime.messages[:-10] == expected[len(covered) :]
    resumed_samples = []
    app.state.assistant_provider_factory = summarizer(app, conversation_id, resumed_samples)
    list(Runtime(app, run_id).compact())
    resumed = [message for batch, _ in resumed_samples for message in batch]
    assert covered + resumed == expected
