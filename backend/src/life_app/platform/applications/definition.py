"""Explicit contract implemented by every application's manifest."""

from dataclasses import dataclass, field

from fastapi import APIRouter

from life_app.core.i18n import locale
from life_app.platform.integrations.definition import MetricProvider


@dataclass(frozen=True)
class ApplicationDefinition:
    id: str
    name: str
    description: str
    path: str
    icon: str
    router: APIRouter
    default_enabled: bool = False
    translations: dict[str, tuple[str, str]] = field(default_factory=dict)
    metrics: MetricProvider | None = None

    def localized_metadata(self) -> tuple[str, str]:
        return self.translations.get(locale(), (self.name, self.description))
