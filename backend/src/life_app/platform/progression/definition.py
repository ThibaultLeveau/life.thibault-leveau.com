from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from life_app.core.i18n import locale


@dataclass(frozen=True)
class Quest:
    id: str
    metric: str
    target: int
    xp: int
    names: tuple[str, str]
    descriptions: tuple[str, str]
    category: str

    def text(self):
        index = 1 if locale() == "en" else 0
        return self.names[index], self.descriptions[index].format(target=self.target)


@dataclass(frozen=True)
class Activity:
    key: str
    occurred_at: datetime
    xp: int
    counters: dict[str, int]
    dimensions: dict[str, list[str]]


class ProgressionProvider(Protocol):
    quests: tuple[Quest, ...]
    titles: tuple[tuple[str, str], ...]
    base_xp: int
    rules: tuple[str, str]

    def history(self, db, user): ...


def quest_ladder(metric, targets, names, descriptions, category):
    """Ten explicit milestones per family; stable IDs survive wording changes."""
    return tuple(
        Quest(
            id=f"{metric}_{target}",
            metric=metric,
            target=target,
            xp=(25, 40, 60, 90, 130, 180, 250, 350, 500, 750)[i],
            names=(f"{names[0]} · {i + 1}", f"{names[1]} · {i + 1}"),
            descriptions=descriptions,
            category=category,
        )
        for i, target in enumerate(targets)
    )


VOLUME = (1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500)
DAYS = (1, 3, 7, 14, 30, 60, 100, 180, 250, 365)
STREAKS = (3, 7, 14, 21, 30, 45, 60, 90, 180, 365)
