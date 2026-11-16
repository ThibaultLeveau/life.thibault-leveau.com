from typing import Protocol

from sqlalchemy.orm import Session

from life_app.platform.auth.models import User
from life_app.platform.integrations.schemas import (
    Evaluation,
    MetricDefinition,
    MetricValue,
    OptionPage,
)


class MetricProvider(Protocol):
    def catalogue(self) -> list[MetricDefinition]: ...

    def options(
        self, db: Session, user: User, filter_id: str, q: str, offset: int, limit: int
    ) -> OptionPage: ...

    def evaluate(self, db: Session, user: User, query: Evaluation) -> MetricValue: ...
