"""Protocol fixtures for stateless OpenAI, Claude and Gemini tool conversations.

Fixtures follow the official Responses reasoning-items, Claude streaming, and
Gemini GenerateContent/FunctionResponse references; no paid API calls are made.
"""

import copy
import json

import httpx
import pytest

from life_app.apps.registry import APPLICATIONS
from life_app.platform.assistant import providers as p


def wrapped_tool(action):
    return {
        "name": action.name,
        "description": action.description,
        "schema": {
            "type": "object",
            "properties": {
                "arguments": action.input_model.model_json_schema(),
                "propose": {"type": "boolean"},
            },
            "required": ["arguments"],
            "additionalProperties": False,
        },
    }


def task_tool():
    tasks = next(app for app in APPLICATIONS if app.id == "tasks")
    return wrapped_tool(
        next(action for action in tasks.actions.actions if action.name == "create_task")
    )


def drain(generator):
    chunks = []
    while True:
        try:
            chunks.append(next(generator))
        except StopIteration as stop:
            return chunks, stop.value


def encoded(events):
    return "".join("data: " + json.dumps(event) + "\n\n" for event in events)


def session(provider, events, *, status=200):
    requests = []

    def response(request):
        requests.append(request)
        return httpx.Response(
            status, text=encoded(events), headers={"Content-Type": "text/event-stream"}
        )

    return p.ProviderSession(
        provider,
        "test-model",
        "synthetic-provider-token",
        "Instructions",
        [{"role": "user", "content": "Create tasks"}],
        transport=httpx.MockTransport(response),
    ), requests


@pytest.mark.parametrize("provider", ["openai", "anthropic", "gemini"])
def test_real_application_schemas_expand_under_arguments_and_preserve_fields(provider):
    model, _ = session(provider, [])
    for app in APPLICATIONS:
        if app.actions is None:
            continue
        for action in app.actions.actions:
            tool = wrapped_tool(action)
            original = copy.deepcopy(tool)
            _, _, body = model.request([tool])
            schema = (
                body["tools"][0]["parameters"]
                if provider == "openai"
                else body["tools"][0]["input_schema"]
                if provider == "anthropic"
                else body["tools"][0]["functionDeclarations"][0]["parametersJsonSchema"]
            )
            assert tool == original
            assert '"$ref"' not in json.dumps(schema)
            assert '"$defs"' not in json.dumps(schema)
            assert schema["properties"]["arguments"]["additionalProperties"] is False
    schema = p.schema_for_provider(task_tool()["schema"])
    payload = schema["properties"]["arguments"]["properties"]["payload"]
    assert "title" in payload["properties"]
    assert "title" in payload["required"]
    assert payload["properties"]["title"]["maxLength"] == 500


def test_local_schema_definitions_do_not_leak_between_siblings():
    def nested(kind):
        return {
            "$defs": {"Value": {"type": kind}},
            "type": "object",
            "properties": {"title": {"$ref": "#/$defs/Value"}},
        }

    result = p.schema_for_provider(
        {"type": "object", "properties": {"left": nested("string"), "right": nested("integer")}}
    )
    assert result["properties"]["left"]["properties"]["title"]["type"] == "string"
    assert result["properties"]["right"]["properties"]["title"]["type"] == "integer"
    for schema in (
        {"$ref": "https://invalid.example/schema"},
        {"$ref": "#/$defs/Missing"},
        {"$defs": {"Loop": {"$ref": "#/$defs/Loop"}}, "$ref": "#/$defs/Loop"},
    ):
        with pytest.raises(p.ProviderError, match="tool_schema_invalid"):
            p.schema_for_provider(schema)


def test_openai_multiple_calls_preserve_encrypted_reasoning_and_match_results():
    reasoning = {
        "id": "rs_1",
        "type": "reasoning",
        "summary": [],
        "encrypted_content": "opaque-reasoning",
    }
    calls = [
        {
            "type": "function_call",
            "id": f"fc_{i}",
            "call_id": f"call_{i}",
            "name": "create_task",
            "arguments": json.dumps({"arguments": {"payload": {"title": f"Task {i}"}}}),
        }
        for i in (1, 2)
    ]
    model, requests = session(
        "openai",
        [
            {"type": "response.output_text.delta", "delta": "Bonjour"},
            {"type": "response.completed", "response": {"output": [reasoning, *calls]}},
        ],
    )
    chunks, response = drain(model.respond([task_tool()]))
    assert "".join(chunks) == response.text == "Bonjour"
    assert [item["id"] for item in response.calls] == ["call_1", "call_2"]
    model.tool_results(
        response.calls, [{"status": "complete", "id": "one"}, {"status": "preview", "id": "two"}]
    )
    _, _, body = model.request([task_tool()])
    assert body["store"] is False
    assert body["include"] == ["reasoning.encrypted_content"]
    assert body["input"][1] == reasoning
    assert [item["call_id"] for item in body["input"][-2:]] == ["call_1", "call_2"]
    assert json.loads(body["input"][-1]["output"])["status"] == "preview"
    assert requests[0].url.host == "api.openai.com"


def test_anthropic_partial_inputs_thinking_and_multiple_tool_results():
    events = [
        {"type": "message_start", "message": {"role": "assistant", "content": []}},
        {
            "type": "content_block_start",
            "index": 0,
            "content_block": {"type": "thinking", "thinking": ""},
        },
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "thinking_delta", "thinking": "private-reasoning"},
        },
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "signature_delta", "signature": "opaque-signature"},
        },
        {"type": "ping"},
        {"type": "content_block_start", "index": 1, "content_block": {"type": "text", "text": ""}},
        {
            "type": "content_block_delta",
            "index": 1,
            "delta": {"type": "text_delta", "text": "Bonjour"},
        },
        {
            "type": "content_block_start",
            "index": 2,
            "content_block": {
                "type": "tool_use",
                "id": "tool_1",
                "name": "create_task",
                "input": {},
            },
        },
        {
            "type": "content_block_delta",
            "index": 2,
            "delta": {"type": "input_json_delta", "partial_json": '{"arguments":{"payload":'},
        },
        {
            "type": "content_block_delta",
            "index": 2,
            "delta": {"type": "input_json_delta", "partial_json": '{"title":"Une tâche"}}}'},
        },
        {
            "type": "content_block_start",
            "index": 3,
            "content_block": {
                "type": "tool_use",
                "id": "tool_2",
                "name": "create_task",
                "input": {"arguments": {"payload": {"title": "Autre"}}},
            },
        },
        *[{"type": "content_block_stop", "index": i} for i in range(4)],
        {"type": "message_delta", "delta": {"stop_reason": "tool_use"}},
        {"type": "message_stop"},
    ]
    model, requests = session("anthropic", events)
    chunks, response = drain(model.respond([task_tool()]))
    assert "".join(chunks) == response.text == "Bonjour"
    assert "private-reasoning" not in "".join(chunks)
    assert (
        json.loads(response.calls[0]["arguments"])["arguments"]["payload"]["title"] == "Une tâche"
    )
    assert json.loads(response.calls[1]["arguments"])["arguments"]["payload"]["title"] == "Autre"
    model.tool_results(response.calls, [{"status": "complete"}, {"status": "preview"}])
    _, _, body = model.request([task_tool()])
    thinking = body["messages"][-2]["content"][0]
    assert thinking == {
        "type": "thinking",
        "thinking": "private-reasoning",
        "signature": "opaque-signature",
    }
    assert [item["tool_use_id"] for item in body["messages"][-1]["content"]] == ["tool_1", "tool_2"]
    assert requests[0].url.host == "api.anthropic.com"


def test_gemini_native_thought_signatures_and_function_ids_survive_tool_turns():
    thought = {"thought": True, "text": "private-reasoning", "thoughtSignature": "opaque-thought"}
    first = {
        "functionCall": {
            "id": "call_one",
            "name": "create_task",
            "args": {"arguments": {"payload": {"title": "One"}}},
        },
        "thoughtSignature": "opaque-tool-signature",
    }
    second = {
        "functionCall": {
            "id": "call_two",
            "name": "create_task",
            "args": {"arguments": {"payload": {"title": "Two"}}},
        }
    }
    model, requests = session(
        "gemini",
        [
            {"candidates": [{"content": {"role": "model", "parts": [thought]}}]},
            {
                "candidates": [
                    {
                        "content": {"role": "model", "parts": [{"text": "Bonjour"}, first, second]},
                        "finishReason": "STOP",
                    }
                ]
            },
        ],
    )
    chunks, response = drain(model.respond([task_tool()]))
    assert "".join(chunks) == response.text == "Bonjour"
    model.tool_results(response.calls, [{"status": "complete"}, {"status": "preview"}])
    _, _, body = model.request([task_tool()])
    assert body["contents"][-2]["parts"] == [thought, {"text": "Bonjour"}, first, second]
    assert [part["functionResponse"]["id"] for part in body["contents"][-1]["parts"]] == [
        "call_one",
        "call_two",
    ]
    assert requests[0].url.host == "generativelanguage.googleapis.com"


@pytest.mark.parametrize(
    "provider,events",
    [
        ("openai", [{"type": "response.output_text.delta", "delta": "Partiel"}]),
        (
            "anthropic",
            [
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "tool_use",
                        "id": "one",
                        "name": "create_task",
                        "input": {},
                    },
                }
            ],
        ),
        ("gemini", [{"candidates": [{"content": {"parts": [{"text": "Partiel"}]}}]}]),
    ],
)
def test_truncated_stream_never_returns_executable_calls(provider, events):
    model, _ = session(provider, events)
    with pytest.raises(p.ProviderError, match="provider_response_incomplete"):
        drain(model.respond([task_tool()]))
    assert len(model.history) == 1


@pytest.mark.parametrize(
    "status,code",
    [
        (401, "invalid_provider_key"),
        (403, "invalid_provider_key"),
        (429, "provider_quota"),
        (400, "provider_request_failed"),
        (503, "provider_unavailable"),
        (302, "provider_unavailable"),
    ],
)
def test_http_errors_are_bounded_codes_without_provider_content(status, code):
    model, requests = session("openai", [{"secret": "not-for-the-client"}], status=status)
    with pytest.raises(p.ProviderError, match=code) as error:
        drain(model.respond([]))
    assert "not-for-the-client" not in str(error.value)
    assert len(requests) == 1


@pytest.mark.parametrize(
    "provider,event",
    [
        ("openai", {"type": "response.incomplete"}),
        ("anthropic", {"type": "error", "error": {"type": "overloaded_error"}}),
        ("anthropic", {"type": "message_delta", "delta": {"stop_reason": "max_tokens"}}),
        ("gemini", {"candidates": [{"finishReason": "MAX_TOKENS"}]}),
    ],
)
def test_in_stream_errors_do_not_produce_success(provider, event):
    model, _ = session(provider, [event])
    with pytest.raises(p.ProviderError, match="provider_response_incomplete"):
        drain(model.respond([]))


def test_hidden_and_tool_only_events_yield_heartbeat_for_runtime_cancellation():
    model, _ = session("anthropic", [{"type": "ping"}, {"type": "message_stop"}])
    generator = model.respond([])
    assert next(generator) == ""
    generator.close()


def test_response_bounds_cover_hidden_arguments_and_total_stream(monkeypatch):
    monkeypatch.setattr(p, "MAX_RESPONSE_BYTES", 120)
    model, _ = session("anthropic", [{"type": "ping", "hidden": "x" * 40}] * 3)
    with pytest.raises(p.ProviderError, match="provider_response_too_large"):
        drain(model.respond([]))


def test_text_bounds_are_checked_before_oversized_chunk_is_emitted(monkeypatch):
    monkeypatch.setattr(p, "MAX_TEXT_CHARS", 4)
    model, _ = session("openai", [{"type": "response.output_text.delta", "delta": "oversized"}])
    generator = model.respond([])
    assert next(generator) == ""
    with pytest.raises(p.ProviderError, match="provider_response_too_large"):
        next(generator)


def test_unknown_provider_and_unsafe_model_are_rejected_before_network():
    for provider, model in [("unknown", "test"), ("gemini", "../../another-route")]:
        with pytest.raises(p.ProviderError, match="provider_request_failed"):
            p.ProviderSession(provider, model, "secret", "Instructions", [])


def test_excessive_tool_calls_are_rejected_before_any_call_is_returned(monkeypatch):
    monkeypatch.setattr(p, "MAX_TOOL_CALLS", 1)
    calls = [
        {
            "type": "function_call",
            "id": str(i),
            "call_id": str(i),
            "name": "create_task",
            "arguments": "{}",
        }
        for i in (1, 2)
    ]
    model, _ = session("openai", [{"type": "response.completed", "response": {"output": calls}}])
    with pytest.raises(p.ProviderError, match="provider_response_too_large"):
        drain(model.respond([]))


def test_stream_errors_close_http_response_without_replaying_partial_tool_inputs():
    class BrokenStream(httpx.SyncByteStream):
        closed = False

        def __iter__(self):
            yield encoded(
                [
                    {
                        "type": "content_block_start",
                        "index": 0,
                        "content_block": {
                            "type": "tool_use",
                            "id": "one",
                            "name": "create_task",
                            "input": {},
                        },
                    }
                ]
            ).encode()
            raise httpx.ReadError("provider body may contain private details")

        def close(self):
            self.closed = True

    stream = BrokenStream()
    model = p.ProviderSession(
        "anthropic",
        "test-model",
        "token",
        "Instructions",
        [],
        transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=stream)),
    )
    with pytest.raises(p.ProviderError, match="provider_unavailable") as error:
        drain(model.respond([]))
    assert "private details" not in str(error.value)
    assert stream.closed
    assert model.history == []


@pytest.mark.parametrize(
    ("provider", "events"),
    [
        ("openai", [{"type": "response.completed", "response": {"output": None}}]),
        (
            "openai",
            [
                {
                    "type": "response.completed",
                    "response": {
                        "output": [
                            {"type": "function_call", "name": "create_task", "arguments": "{}"}
                        ]
                    },
                }
            ],
        ),
        (
            "openai",
            [
                {
                    "type": "response.completed",
                    "response": {
                        "output": [
                            {
                                "type": "function_call",
                                "call_id": "one",
                                "name": "create_task",
                                "arguments": "[]",
                            }
                        ]
                    },
                }
            ],
        ),
        (
            "anthropic",
            [
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {"type": "tool_use", "id": "one", "name": "create_task"},
                },
                {"type": "content_block_stop", "index": 0},
                {"type": "message_stop"},
            ],
        ),
        (
            "anthropic",
            [
                {
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {
                        "type": "tool_use",
                        "id": "one",
                        "name": "create_task",
                        "input": {},
                    },
                },
                {"type": "message_stop"},
            ],
        ),
        (
            "gemini",
            [
                {
                    "candidates": [
                        {"content": {"parts": [{"functionCall": None}]}, "finishReason": "STOP"}
                    ]
                }
            ],
        ),
        (
            "gemini",
            [
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [{"functionCall": {"name": "create_task", "args": []}}]
                            },
                            "finishReason": "STOP",
                        }
                    ]
                }
            ],
        ),
    ],
)
def test_malformed_tool_responses_never_dispatch_or_pollute_history(provider, events):
    model, _ = session(provider, events)
    before = copy.deepcopy(model.history)
    with pytest.raises(p.ProviderError, match="provider_response_incomplete"):
        drain(model.respond([task_tool()]))
    assert model.history == before


def test_unterminated_sse_line_is_bounded_before_full_provider_body(monkeypatch):
    monkeypatch.setattr(p, "MAX_EVENT_BYTES", 9000)
    consumed = []

    class UnboundedBody(httpx.SyncByteStream):
        def __iter__(self):
            for _ in range(1000):
                consumed.append(1)
                yield b"x" * 8192

    model = p.ProviderSession(
        "openai",
        "test-model",
        "synthetic-token",
        "",
        [],
        transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=UnboundedBody())),
    )
    with pytest.raises(p.ProviderError, match="provider_response_too_large"):
        drain(model.respond([]))
    assert len(consumed) == 2
