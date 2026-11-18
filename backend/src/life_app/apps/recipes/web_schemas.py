"""Contracts for the explicit, review-before-save web import workflow."""

import re
from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from life_app.apps.recipes.schemas import Contract, Quantity, Servings, Unit


def public_url(value):
    if value is None:
        return value
    try:
        parsed = urlsplit(value)
        if (
            len(value) > 2048
            or any(ord(c) <= 32 or ord(c) == 127 for c in value)
            or "\\" in value
            or parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.port not in {None, 80, 443}
        ):
            raise ValueError
    except ValueError:
        raise ValueError("A public HTTP or HTTPS URL without credentials is required") from None
    return value


class BrowserOpen(Contract):
    id: UUID
    url: str = Field(min_length=1, max_length=2048)
    width: int = Field(default=1024, ge=320, le=1280, strict=True)

    _url = field_validator("url")(public_url)


class BrowserFrame(Contract):
    id: UUID
    url: str
    title: str
    document: int
    width: int
    height: int
    image: str | None
    expires_at: datetime


class BrowserInput(Contract):
    action: Literal["click", "move", "down", "up", "scroll", "key", "text", "back", "reload"]
    document: int = Field(ge=0, strict=True)
    x: float | None = Field(default=None, ge=0, le=1280, allow_inf_nan=False)
    y: float | None = Field(default=None, ge=0, le=720, allow_inf_nan=False)
    dx: float | None = Field(default=None, ge=-1500, le=1500, allow_inf_nan=False)
    dy: float | None = Field(default=None, ge=-1500, le=1500, allow_inf_nan=False)
    key: str | None = Field(default=None, max_length=16)
    text: str | None = Field(default=None, min_length=1, max_length=2000)

    @model_validator(mode="after")
    def command_parameters(self):
        required = {
            "click": ("x", "y"),
            "move": ("x", "y"),
            "down": ("x", "y"),
            "up": ("x", "y"),
            "scroll": ("dx", "dy"),
            "key": ("key",),
            "text": ("text",),
            "back": (),
            "reload": (),
        }[self.action]
        for field in ("x", "y", "dx", "dy", "key", "text"):
            if (getattr(self, field) is not None) != (field in required):
                raise ValueError("Invalid parameters for this browser action")
        if self.key is not None and self.key not in {
            "Enter",
            "Tab",
            "Shift+Tab",
            "Backspace",
            "Delete",
            "Escape",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End",
            "PageUp",
            "PageDown",
            "Space",
        }:
            raise ValueError("Unsupported browser key")
        if self.text and any(ord(c) < 32 and c not in "\n\t\r" or ord(c) == 127 for c in self.text):
            raise ValueError("Unsupported control character")
        return self


class ImportPrepare(Contract):
    session_id: UUID | None = None
    document: int | None = Field(default=None, ge=0, strict=True)
    text: str | None = Field(default=None, min_length=20, max_length=60000)
    source_url: str | None = Field(default=None, max_length=2048)

    _url = field_validator("source_url")(public_url)

    @model_validator(mode="after")
    def exactly_one_source(self):
        if (
            bool(self.session_id) == bool(self.text)
            or (
                self.session_id is not None
                and (self.document is None or self.source_url is not None)
            )
            or (self.text is not None and self.document is not None)
        ):
            raise ValueError("Provide a browser session with document version, or recipe text")
        return self


# A range has no faithful scalar value. Keep it in source_text for human review.
_RANGE_NUMBER = r"(?:\d+(?:[.,]\d+)?|\d+/\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])"
_MEASUREMENT_RANGE = re.compile(rf"\s*{_RANGE_NUMBER}\s*(?:[-–—]|to|à)\s*{_RANGE_NUMBER}\s*")


def uncertain_range(value):
    if isinstance(value, str) and _MEASUREMENT_RANGE.fullmatch(value):
        return None
    return value


class ExtractedIngredient(Contract):
    name: str = Field(min_length=1, max_length=120)
    source_text: str = Field(min_length=1, max_length=1000)
    quantity: Quantity | None
    unit: Unit | None
    note: str = Field(default="", max_length=500)

    _quantity = field_validator("quantity", mode="before")(uncertain_range)


class ExtractedRecipe(Contract):
    is_recipe: bool
    title: str = Field(max_length=160)
    servings: Servings | None
    instructions: str = Field(max_length=20000)
    items: list[ExtractedIngredient] = Field(max_length=200)
    warnings: list[str] = Field(default_factory=list, max_length=20)

    _servings = field_validator("servings", mode="before")(uncertain_range)

    @field_validator("warnings")
    @classmethod
    def bounded_warnings(cls, value):
        if any(len(item) > 500 for item in value):
            raise ValueError("Warning too long")
        return value


class DraftIngredient(ExtractedIngredient):
    ingredient_id: UUID | None = None
    catalogue_name: str | None = None


class ImportDraft(Contract):
    import_id: UUID
    locale: Literal["fr", "en"]
    title: str
    servings: int | None
    instructions: str
    items: list[DraftIngredient]
    warnings: list[str]
    source_url: str | None
    source_title: str


class ImportIngredient(Contract):
    ingredient_id: UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    quantity: Quantity
    unit: Unit


class ImportSave(Contract):
    import_id: UUID
    locale: Literal["fr", "en"]
    title: str = Field(min_length=1, max_length=160)
    servings: Servings
    instructions: str = Field(max_length=20000)
    items: list[ImportIngredient] = Field(min_length=1, max_length=200)
    source_url: str | None = Field(default=None, max_length=2048)
    source_title: str = Field(default="", max_length=300)

    _url = field_validator("source_url")(public_url)
