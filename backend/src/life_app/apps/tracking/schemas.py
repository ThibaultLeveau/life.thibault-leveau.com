from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StrictBool, field_validator, model_validator

from life_app.apps.tracking.messages import tr
from life_app.platform.integrations.schemas import (
    Contract,
    DynamicSource,
    Evaluation,
    Frequency,
    MetricValue,
)

Number = Annotated[float, Field(strict=True, allow_inf_nan=False, ge=-1e12, le=1e12)]
Value = StrictBool | Number | Annotated[str, Field(max_length=4000)] | None


class Goal(Contract):
    mode: Literal["at_least", "at_most", "between", "equals"] = "at_least"
    target: StrictBool | Number | Annotated[str, Field(max_length=100)]
    upper: Number | None = None
    tolerance: float = Field(1, gt=0, le=1e12, allow_inf_nan=False)

    @model_validator(mode="after")
    def valid_goal(self):
        if self.mode != "equals" and type(self.target) not in (float, int):
            raise ValueError(tr("invalid"))
        if self.mode == "between" and (self.upper is None or self.upper < self.target):
            raise ValueError(tr("invalid"))
        if self.mode != "between" and self.upper is not None:
            raise ValueError(tr("invalid"))
        return self


class TrackingField(Contract):
    id: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,60}$")
    label: str = Field(min_length=1, max_length=120)
    kind: Literal["number", "boolean", "duration", "scale", "choice", "note"] = "number"
    unit: str = Field("", max_length=20)
    required: StrictBool = True
    weekdays: list[Annotated[int, Field(ge=0, le=6, strict=True)]] = Field(
        default_factory=lambda: list(range(7)), min_length=1, max_length=7
    )
    minimum: Number = 0
    maximum: Number = 1000000000
    options: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=20
    )
    goal: Goal | None = None
    weight: float = Field(1, gt=0, le=10, allow_inf_nan=False)
    source: DynamicSource | None = None

    @model_validator(mode="after")
    def valid_field(self):
        if self.minimum >= self.maximum or len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError(tr("invalid"))
        if self.kind == "duration" and self.minimum < 0:
            raise ValueError(tr("invalid"))
        if self.kind == "duration" and self.source is None:
            if self.unit not in {"", "min"}:
                raise ValueError(tr("invalid"))
            self.unit = "min"
        if self.kind == "choice" and (
            len(self.options) < 2 or len(set(self.options)) != len(self.options)
        ):
            raise ValueError(tr("invalid"))
        if self.kind != "choice" and self.options:
            raise ValueError(tr("invalid"))
        if self.source and self.kind not in {"number", "duration", "scale"}:
            raise ValueError(tr("invalid"))
        if self.goal:
            target = self.goal.target
            valid = (
                self.kind == "boolean"
                and type(target) is bool
                and self.goal.mode == "equals"
                or self.kind == "choice"
                and target in self.options
                and self.goal.mode == "equals"
                or self.kind in {"number", "duration", "scale"}
                and type(target) in (int, float)
                and self.minimum <= target <= self.maximum
            )
            if not valid or self.goal.upper is not None and self.goal.upper > self.maximum:
                raise ValueError(tr("invalid"))
        return self


class TrackerInput(Contract):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field("", max_length=1000)
    frequency: Frequency = "daily"
    timezone: str = "Europe/Paris"
    start_date: date
    color: str = Field("#b84f39", pattern=r"^#[0-9a-fA-F]{6}$")
    fields: list[TrackingField] = Field(min_length=1, max_length=30)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        return Evaluation.valid_timezone(value)

    @field_validator("start_date")
    @classmethod
    def valid_date(cls, value):
        if not date(2000, 1, 1) <= value <= date(2100, 12, 31):
            raise ValueError(tr("invalid"))
        return value

    @model_validator(mode="after")
    def unique_fields(self):
        if len({f.id for f in self.fields}) != len(self.fields):
            raise ValueError(tr("invalid"))
        return self


class Version(Contract):
    expected_version: int = Field(ge=1, strict=True)


class TrackerUpdate(TrackerInput, Version):
    pass


class Archive(Version):
    archived: StrictBool


class Order(Contract):
    ids: list[UUID] = Field(min_length=1, max_length=50)


class TrackerOutput(TrackerInput):
    id: UUID
    version: int
    position: int
    archived_at: datetime | None
    effective_from: date
    created_at: datetime


class Settings(Contract):
    timezone: str = "Europe/Paris"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        return Evaluation.valid_timezone(value)


class SourceSnapshot(Contract):
    query: Evaluation
    result: MetricValue


class EntryWrite(Contract):
    expected_version: int = Field(0, ge=0, strict=True)
    values: dict[str, Value] = Field(default_factory=dict, max_length=30)
    complete: StrictBool = False
    refresh_sources: StrictBool = False


class EntryOutput(Contract):
    id: UUID
    tracker_id: UUID
    period_start: date
    period_end: date
    definition: TrackerInput
    values: dict[str, Value]
    sources: dict[str, SourceSnapshot]
    version: int
    status: Literal["draft", "complete"]
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    score: float | None
    filled: int
    expected: int
    xp: int


class Occurrence(Contract):
    tracker_id: UUID
    definition: TrackerInput
    period_start: date
    period_end: date
    fields: list[TrackingField]
    entry: EntryOutput | None
    sources: dict[str, SourceSnapshot] = {}


class DaySummary(Contract):
    date: date
    state: Literal["rest", "future", "missing", "partial", "complete"]
    completed: int = 0
    expected: int = 0
    filled: int = 0
    fields: int = 0
    score: float | None = None


class Calendar(Contract):
    since: date
    until: date
    today: date
    days: list[DaySummary]
    periods: list[Occurrence]


class Badge(Contract):
    id: str
    name: str
    description: str
    progress: int
    target: int
    earned: bool


class Achievement(Contract):
    xp: int
    level: int
    next_level_xp: int
    completed_periods: int
    perfect_periods: int
    streak: int
    best_streak: int
    badges: list[Badge]


class EntryRevision(Contract):
    version: int
    recorded_at: datetime
    snapshot: EntryOutput


class Point(Contract):
    date: date
    value: Value
    label: str
    unit: str


class Trend(Contract):
    field_id: str
    points: list[Point]


class Statistics(Contract):
    calendar: Calendar
    completion_rate: float | None
    average_score: float | None
    achievements: Achievement
    trends: list[Trend]
