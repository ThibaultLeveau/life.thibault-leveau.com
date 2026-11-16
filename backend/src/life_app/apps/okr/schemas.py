from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dateutil.relativedelta import relativedelta
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from life_app.apps.okr.messages import tr

Horizon = Literal["ten_year", "three_year", "annual", "quarterly"]
Domain = Literal["personal", "professional"]
Status = Literal["backlog", "in_progress", "done"]
Quarter = Annotated[str, Field(pattern=r"^(20\d{2}|2100)-Q[1-4]$")]
Number = Annotated[float, Field(strict=True, allow_inf_nan=False, ge=-1e12, le=1e12)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)


def quarter(day: date) -> str:
    return f"{day.year}-Q{(day.month - 1) // 3 + 1}"


class KeyResult(Contract):
    id: UUID = Field(default_factory=uuid4)
    title: str = Field(min_length=1, max_length=200)
    start: Number = 0
    target: Number
    current: Number = 0
    unit: str = Field("", max_length=30)

    @model_validator(mode="after")
    def measurable(self):
        if self.target == self.start:
            raise ValueError(tr("target"))
        return self

    @property
    def progress(self):
        return max(0.0, min(1.0, (self.current - self.start) / (self.target - self.start)))


class ObjectiveInput(Contract):
    title: str = Field(min_length=1, max_length=200)
    domain: Domain = "personal"
    horizon: Horizon = "ten_year"
    parent_id: UUID | None = None
    why: str = Field("", max_length=2000)
    outcome: str = Field("", max_length=2000)
    first_action: str = Field("", max_length=1000)
    start_date: date | None = None
    due_date: date | None = None
    key_results: list[KeyResult] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def detailed_enough(self):
        if self.horizon != "ten_year" and not self.why:
            raise ValueError(tr("why"))
        if self.horizon in {"annual", "quarterly"} and not self.outcome:
            raise ValueError(tr("outcome"))
        if (self.start_date is None) != (self.due_date is None):
            raise ValueError(tr("dates"))
        if self.start_date and not date(2000, 1, 1) <= self.start_date <= self.due_date <= date(
            2100, 12, 31
        ):
            raise ValueError(tr("dates"))
        if self.horizon == "quarterly":
            if not self.first_action or not self.key_results or not self.start_date:
                raise ValueError(tr("quarter_details"))
            if self.due_date > self.start_date + relativedelta(months=1) - timedelta(days=1):
                raise ValueError(tr("one_month"))
        if len({kr.id for kr in self.key_results}) != len(self.key_results):
            raise ValueError(tr("duplicate"))
        return self


class Version(Contract):
    expected_version: int = Field(ge=1, strict=True)


class ObjectiveUpdate(ObjectiveInput, Version):
    pass


class Move(Version):
    status: Status
    position: int = Field(0, ge=0, le=10000, strict=True)


class Archive(Version):
    archived: StrictBool


class CheckIn(Version):
    value: Number
    note: str = Field("", max_length=1000)


class ObjectiveOutput(ObjectiveInput):
    id: UUID
    version: int
    status: Status
    position: int
    planned_quarter: str | None
    completed_quarter: str | None
    progress: float
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    archived_at: datetime | None


class EventOutput(Contract):
    id: UUID
    objective_id: UUID
    kind: str
    occurred_at: datetime
    quarter: str
    snapshot: ObjectiveOutput
    detail: dict


class Achievement(EventOutput):
    reopened: bool


class AchievementPage(Contract):
    quarter: str
    quarters: list[str]
    items: list[Achievement]
    total: int


class Settings(Contract):
    timezone: str = Field("Europe/Paris", max_length=100)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError):
            raise ValueError(tr("timezone")) from None
        return value


class SettingsOutput(Settings):
    version: int
    today: date
    current_quarter: str


class SettingsUpdate(Settings):
    expected_version: int = Field(ge=0, strict=True)
