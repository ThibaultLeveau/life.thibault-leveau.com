"""Localized errors retain stable assistant codes for API clients and stream events."""

from pathlib import Path

from fastapi import HTTPException

from life_app.core.i18n import Catalogue

tr = Catalogue(Path(__file__).with_name("locales"), "assistant")


def failure(status, detail, *, headers=None):
    if isinstance(detail, str) and detail.startswith("assistant."):
        detail = tr(detail.removeprefix("assistant."))
    return HTTPException(status, detail, headers=headers)
