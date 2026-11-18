"""Life AI text keeps historical assistant.* codes; provider errors stay shared."""

from pathlib import Path

from fastapi import HTTPException

from life_app.core.i18n import Catalogue
from life_app.platform.assistant.messages import tr as provider_message

tr = Catalogue(Path(__file__).with_name("locales"), "assistant")
for language in ("fr", "en"):
    tr.messages[language] = provider_message.messages[language] | tr.messages[language]


def failure(status, detail, *, headers=None):
    if isinstance(detail, str) and detail.startswith("assistant."):
        detail = tr(detail.removeprefix("assistant."))
    return HTTPException(status, detail, headers=headers)
