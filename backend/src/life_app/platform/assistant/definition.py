"""Neutral contracts; applications own their capabilities and business rules."""

from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any

from pydantic import BaseModel, ConfigDict, create_model
from sqlalchemy.orm import Session

from life_app.core.i18n import locale
from life_app.platform.auth.models import User


@dataclass(frozen=True)
class ActionContext:
    db: Session
    user: User
    definitions: tuple


@dataclass(frozen=True)
class ActionDefinition:
    name: str
    description: str
    input_model: type[BaseModel]
    handler: Callable[[ActionContext, BaseModel], Any]
    method: str
    path: str
    mutating: bool = False
    confirmation: bool = False
    output_model: Any = None
    precondition: Callable[[ActionContext, BaseModel], str] | None = None
    labels: tuple[str, str] | None = None
    preview_targets: Callable[[ActionContext, BaseModel], list[str]] | None = None

    def localized_label(self) -> str:
        return self.labels[locale() == "en"] if self.labels else self.description


@dataclass(frozen=True)
class ActionProvider:
    actions: tuple[ActionDefinition, ...]

    def with_labels(self, labels: dict[str, tuple[str, str]]) -> "ActionProvider":
        if set(labels) != {action.name for action in self.actions}:
            raise ValueError("Every action needs a localized presentation label")
        return ActionProvider(
            tuple(replace(action, labels=labels[action.name]) for action in self.actions)
        )


def arguments(name: str, **fields) -> type[BaseModel]:
    """Build a closed input contract from existing domain schemas and typed fields."""
    return create_model(name, __config__=ConfigDict(extra="forbid"), **fields)
