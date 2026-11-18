"""Small provider adapters preserving native tool items inside each agent's loop."""

import json
import re
from dataclasses import dataclass, field
from uuid import uuid4

import httpx

MAX_EVENT_BYTES = 2_000_000
MAX_RESPONSE_BYTES = 4_000_000
MAX_TEXT_CHARS = 60_000
MAX_TOOL_CALLS = 16
MAX_EVENTS = 20_000


class ProviderError(Exception):
    def __init__(self, code="assistant.provider_unavailable"):
        self.code = code
        super().__init__(code)


@dataclass
class Response:
    text: str = ""
    calls: list[dict] = field(default_factory=list)
    native: list[dict] = field(default_factory=list)


def bounded_lines(response):
    """Cap undecoded SSE buffering even when an upstream never sends a newline."""
    pending = bytearray()
    received = 0
    for chunk in response.iter_bytes():
        received += len(chunk)
        if received > MAX_RESPONSE_BYTES:
            raise ProviderError("assistant.provider_response_too_large")
        pending.extend(chunk)
        while (end := pending.find(b"\n")) >= 0:
            if end > MAX_EVENT_BYTES:
                raise ProviderError("assistant.provider_response_too_large")
            line = bytes(pending[:end]).decode("utf-8").rstrip("\r")
            del pending[: end + 1]
            yield line
        if len(pending) > MAX_EVENT_BYTES:
            raise ProviderError("assistant.provider_response_too_large")
    if pending:
        yield pending.decode("utf-8").rstrip("\r")


def schema_for_provider(schema):
    """Inline local Pydantic references, including schemas nested in tool wrappers.

    Property names belong to the user's contract: a property called ``title``
    must not disappear when schema metadata titles are stripped.
    """
    nodes = 0

    def expand(value, definitions, depth=0):
        nonlocal nodes
        nodes += 1
        if nodes > 30000:
            raise ProviderError("assistant.tool_schema_invalid")
        if depth > 25:
            raise ProviderError("assistant.tool_schema_invalid")
        if isinstance(value, dict):
            definitions = {**definitions, **value.get("$defs", {})}
            if "$ref" in value:
                reference = value["$ref"]
                if not reference.startswith("#/$defs/") or reference[8:] not in definitions:
                    raise ProviderError("assistant.tool_schema_invalid")
                resolved = expand(definitions[reference[8:]], definitions, depth + 1)
                siblings = expand(
                    {k: v for k, v in value.items() if k != "$ref"}, definitions, depth + 1
                )
                return {**resolved, **siblings}
            result = {}
            for key, item in value.items():
                if key in {"$defs", "title", "default", "discriminator"}:
                    continue
                if key in {"properties", "patternProperties"}:
                    result[key] = {
                        name: expand(spec, definitions, depth + 1) for name, spec in item.items()
                    }
                else:
                    result[key] = expand(item, definitions, depth + 1)
            return result
        if isinstance(value, list):
            return [expand(item, definitions, depth + 1) for item in value]
        return value

    return expand(schema, {})


class ProviderSession:
    def __init__(self, provider, model, token, instructions, messages, *, transport=None):
        if provider not in {"openai", "anthropic", "gemini"} or not re.fullmatch(
            r"[a-zA-Z0-9._:-]{1,120}", model
        ):
            raise ProviderError("assistant.provider_request_failed")
        self.provider = provider
        self.model = model
        self.token = token
        self.instructions = instructions
        self.transport = transport
        if provider == "gemini":
            self.history = [
                {
                    "role": "model" if item["role"] == "assistant" else "user",
                    "parts": [{"text": item["content"]}],
                }
                for item in messages
            ]
        else:
            self.history = [{"role": item["role"], "content": item["content"]} for item in messages]

    def request(self, tools):
        headers = {"Content-Type": "application/json"}
        if self.provider == "openai":
            headers["Authorization"] = "Bearer " + self.token
            body = {
                "model": self.model,
                "instructions": self.instructions,
                "input": self.history,
                "store": False,
                "include": ["reasoning.encrypted_content"],
                "stream": True,
                "max_output_tokens": 5000,
            }
            if tools:
                body["tools"] = [
                    {
                        "type": "function",
                        "name": tool["name"],
                        "description": tool["description"],
                        "parameters": schema_for_provider(tool["schema"]),
                        "strict": False,
                    }
                    for tool in tools
                ]
            return "https://api.openai.com/v1/responses", headers, body
        if self.provider == "anthropic":
            headers.update({"x-api-key": self.token, "anthropic-version": "2023-06-01"})
            body = {
                "model": self.model,
                "system": self.instructions,
                "messages": self.history,
                "max_tokens": 5000,
                "stream": True,
            }
            if tools:
                body["tools"] = [
                    {
                        "name": tool["name"],
                        "description": tool["description"],
                        "input_schema": schema_for_provider(tool["schema"]),
                    }
                    for tool in tools
                ]
            return "https://api.anthropic.com/v1/messages", headers, body
        headers["x-goog-api-key"] = self.token
        body = {
            "systemInstruction": {"parts": [{"text": self.instructions}]},
            "contents": self.history,
            "generationConfig": {"maxOutputTokens": 5000},
        }
        if tools:
            body["tools"] = [
                {
                    "functionDeclarations": [
                        {
                            "name": tool["name"],
                            "description": tool["description"],
                            "parametersJsonSchema": schema_for_provider(tool["schema"]),
                        }
                        for tool in tools
                    ]
                }
            ]
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?alt=sse",
            headers,
            body,
        )

    def respond(self, tools):
        url, headers, body = self.request(tools)
        result = Response()
        blocks = {}
        closed_blocks = set()
        completed = False
        received_bytes = 0
        events = 0
        try:
            with (
                httpx.Client(
                    timeout=httpx.Timeout(35, connect=10),
                    follow_redirects=False,
                    transport=self.transport,
                ) as client,
                client.stream("POST", url, headers=headers, json=body) as response,
            ):
                if response.status_code >= 400:
                    code = (
                        "assistant.invalid_provider_key"
                        if response.status_code in {401, 403}
                        else "assistant.provider_quota"
                        if response.status_code == 429
                        else "assistant.provider_request_failed"
                        if response.status_code in {400, 404, 422}
                        else "assistant.provider_unavailable"
                    )
                    raise ProviderError(code)
                if response.status_code != 200:
                    raise ProviderError()
                for line in bounded_lines(response):
                    line_bytes = len(line.encode("utf-8"))
                    received_bytes += line_bytes
                    events += 1
                    if (
                        line_bytes > MAX_EVENT_BYTES
                        or received_bytes > MAX_RESPONSE_BYTES
                        or events > MAX_EVENTS
                    ):
                        raise ProviderError("assistant.provider_response_too_large")
                    # Allow the runtime to check cancellation/deadline even during
                    # tool arguments, thinking and keepalive events without text.
                    yield ""
                    if not line.startswith("data:") or line[5:].strip() == "[DONE]":
                        continue
                    event = json.loads(line[5:])
                    if not isinstance(event, dict):
                        raise ProviderError("assistant.provider_response_incomplete")
                    kind = event.get("type")
                    if kind in {"error", "response.failed", "response.incomplete"}:
                        raise ProviderError("assistant.provider_response_incomplete")
                    if self.provider == "openai":
                        if kind == "response.output_text.delta":
                            text = event.get("delta", "")
                            result.text += text
                            if len(result.text) > MAX_TEXT_CHARS:
                                raise ProviderError("assistant.provider_response_too_large")
                            yield text
                        elif kind == "response.completed":
                            result.native = event["response"].get("output", [])
                            completed = True
                    elif self.provider == "anthropic":
                        if kind == "content_block_start":
                            if event["index"] in blocks:
                                raise ProviderError("assistant.provider_response_incomplete")
                            blocks[event["index"]] = dict(event["content_block"])
                        elif kind == "content_block_delta":
                            if event["index"] in closed_blocks:
                                raise ProviderError("assistant.provider_response_incomplete")
                            block = blocks[event["index"]]
                            delta = event["delta"]
                            if delta["type"] == "text_delta":
                                text = delta.get("text", "")
                                block["text"] = block.get("text", "") + text
                                result.text += text
                                if len(result.text) > MAX_TEXT_CHARS:
                                    raise ProviderError("assistant.provider_response_too_large")
                                yield text
                            elif delta["type"] == "input_json_delta":
                                block["_json"] = block.get("_json", "") + delta["partial_json"]
                            elif delta["type"] == "thinking_delta":
                                block["thinking"] = block.get("thinking", "") + delta.get(
                                    "thinking", ""
                                )
                            elif delta["type"] == "signature_delta":
                                block["signature"] = delta["signature"]
                        elif kind == "content_block_stop":
                            if event["index"] not in blocks or event["index"] in closed_blocks:
                                raise ProviderError("assistant.provider_response_incomplete")
                            closed_blocks.add(event["index"])
                        elif (
                            kind == "message_delta"
                            and event.get("delta", {}).get("stop_reason") == "max_tokens"
                        ):
                            raise ProviderError("assistant.provider_response_incomplete")
                        elif kind == "message_stop":
                            if set(blocks) != closed_blocks:
                                raise ProviderError("assistant.provider_response_incomplete")
                            completed = True
                    else:
                        # Only one candidate is requested. Mixing alternate
                        # candidates could execute incompatible tool plans.
                        for candidate in event.get("candidates", [])[:1]:
                            for part in candidate.get("content", {}).get("parts", []):
                                result.native.append(part)
                                if "text" in part and not part.get("thought"):
                                    result.text += part["text"]
                                    if len(result.text) > MAX_TEXT_CHARS:
                                        raise ProviderError("assistant.provider_response_too_large")
                                    yield part["text"]
                            reason = candidate.get("finishReason")
                            if reason:
                                if reason not in {"STOP", "FINISH_REASON_UNSPECIFIED"}:
                                    raise ProviderError("assistant.provider_response_incomplete")
                                completed = True
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError, IndexError):
            raise ProviderError() from None
        if not completed:
            raise ProviderError("assistant.provider_response_incomplete")
        try:
            return self.finish_response(result, blocks)
        except (ValueError, KeyError, TypeError, AttributeError, IndexError):
            raise ProviderError("assistant.provider_response_incomplete") from None

    def finish_response(self, result, blocks):
        """Validate all native tool calls before they enter history or dispatch."""
        if self.provider == "openai":
            for item in result.native:
                if item.get("type") == "function_call":
                    result.calls.append(
                        {
                            "id": item["call_id"],
                            "name": item["name"],
                            "arguments": item["arguments"],
                        }
                    )
        elif self.provider == "anthropic":
            for block in blocks.values():
                if block.get("type") == "tool_use":
                    if "_json" in block:
                        try:
                            block["input"] = json.loads(block.pop("_json"))
                        except ValueError:
                            raise ProviderError("assistant.provider_response_incomplete") from None
                    result.calls.append(
                        {
                            "id": block["id"],
                            "name": block["name"],
                            "arguments": json.dumps(block["input"]),
                        }
                    )
            result.native = [blocks[index] for index in sorted(blocks)]
        else:
            for part in result.native:
                if "functionCall" in part:
                    call = part["functionCall"]
                    result.calls.append(
                        {
                            "id": call.get("id", str(uuid4())),
                            "provider_id": call.get("id"),
                            "name": call["name"],
                            "arguments": json.dumps(call.get("args", {})),
                        }
                    )
        if len(result.calls) > MAX_TOOL_CALLS:
            raise ProviderError("assistant.provider_response_too_large")
        ids = set()
        for call in result.calls:
            if (
                not isinstance(call["id"], str)
                or not call["id"]
                or call["id"] in ids
                or not isinstance(call["name"], str)
                or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", call["name"])
                or not isinstance(call["arguments"], str)
                or not isinstance(json.loads(call["arguments"]), dict)
            ):
                raise ProviderError("assistant.provider_response_incomplete")
            ids.add(call["id"])
        if self.provider == "openai":
            self.history.extend(result.native)
        elif self.provider == "anthropic":
            self.history.append({"role": "assistant", "content": result.native})
        else:
            self.history.append({"role": "model", "parts": result.native})
        return result

    def tool_results(self, calls, results):
        if self.provider == "openai":
            self.history.extend(
                {
                    "type": "function_call_output",
                    "call_id": call["id"],
                    "output": json.dumps(result, ensure_ascii=False, default=str),
                }
                for call, result in zip(calls, results, strict=True)
            )
        elif self.provider == "anthropic":
            self.history.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": call["id"],
                            "content": json.dumps(result, ensure_ascii=False, default=str),
                        }
                        for call, result in zip(calls, results, strict=True)
                    ],
                }
            )
        else:
            self.history.append(
                {
                    "role": "user",
                    "parts": [
                        {
                            "functionResponse": {
                                "name": call["name"],
                                "response": {"result": result},
                                **({"id": call["provider_id"]} if call.get("provider_id") else {}),
                            }
                        }
                        for call, result in zip(calls, results, strict=True)
                    ],
                }
            )
