"""Request-scoped language and versioned message catalogues, without business imports."""

import json
from contextvars import ContextVar
from pathlib import Path
from typing import Literal

from starlette.requests import Request

Locale = Literal["fr", "en"]
request_context: ContextVar[Request | None] = ContextVar("life_request", default=None)


def negotiate_language(value: str) -> Locale:
    candidates = []
    for index, part in enumerate(value.split(",")):
        tag, *parameters = part.strip().lower().split(";")
        quality = 1.0
        try:
            for parameter in parameters:
                if parameter.strip().startswith("q="):
                    quality = float(parameter.strip()[2:])
        except ValueError:
            continue
        language = tag.split("-")[0]
        if language in {"fr", "en"} and 0 < quality <= 1:
            candidates.append((quality, -index, language))
    return max(candidates)[2] if candidates else "fr"


def locale() -> Locale:
    request = request_context.get()
    return getattr(request.state, "locale", "fr") if request else "fr"


class Message(str):
    """A localized string retaining its stable machine code for HTTP errors."""

    def __new__(cls, value: str, code: str):
        result = super().__new__(cls, value)
        result.code = code
        return result


class Catalogue:
    def __init__(self, directory: Path, domain: str):
        self.domain = domain
        self.messages = {
            lang: json.loads((directory / f"{lang}.json").read_text(encoding="utf-8"))
            for lang in ("fr", "en")
        }
        if self.messages["fr"].keys() != self.messages["en"].keys():
            raise ValueError(f"Incomplete translation catalogue: {domain}")

    def __call__(self, message_id: str, *, language: Locale | None = None, **values) -> Message:
        return Message(
            self.messages[language or locale()][message_id].format(**values),
            f"{self.domain}.{message_id}",
        )
