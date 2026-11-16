from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from life_app.platform.progression.messages import tr


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class Vacation(Contract):
    start: date
    end: date

    @model_validator(mode="after")
    def valid(self):
        if not date(2000, 1, 1) <= self.start <= self.end <= date(2100, 12, 31):
            raise ValueError(tr("invalid"))
        return self


class Settings(Contract):
    timezone: str = Field("Europe/Paris", max_length=100)
    exclude_weekends: dict[str, StrictBool] = Field(default_factory=dict, max_length=50)
    vacations: list[Vacation] = Field(default_factory=list, max_length=100)

    @field_validator("timezone")
    @classmethod
    def zone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(tr("invalid")) from None
        return value

    @model_validator(mode="after")
    def intervals(self):
        ordered = sorted(self.vacations, key=lambda v: v.start)
        if any(a.end >= b.start for a, b in zip(ordered, ordered[1:], strict=False)):
            raise ValueError(tr("invalid"))
        self.vacations = ordered
        return self


class SettingsOutput(Settings):
    version: int


class SettingsWrite(Settings):
    expected_version: Annotated[int, Field(ge=0, strict=True)]


class QuestOutput(Contract):
    id: str
    name: str
    description: str
    category: str
    target: int
    progress: int
    xp: int
    earned_at: datetime | None
    ratio: float


class Title(Contract):
    level: int
    name: str
    xp: int
    earned: bool


class Summary(Contract):
    application_id: str
    name: str
    icon: str
    xp: int
    level: int
    title: str
    level_xp: int
    next_level_xp: int | None
    level_progress: float
    titles: list[Title]
    streak: int
    best_streak: int
    next_streak: int | None
    active_days: int
    today_active: bool
    paused_today: bool
    exclude_weekends: bool
    timezone: str
    quests_earned: int
    quests_total: int
    closest: list[QuestOutput]
    base_xp: int
    rules: str


class QuestPage(Contract):
    items: list[QuestOutput]
    total: int
    offset: int
    limit: int


class RewardOutput(Contract):
    id: UUID
    kind: Literal["activity", "quest"]
    label: str
    xp: int
    occurred_at: datetime
    recorded_at: datetime
    imported: bool


class History(Contract):
    items: list[RewardOutput]
    total: int
    offset: int
    limit: int
