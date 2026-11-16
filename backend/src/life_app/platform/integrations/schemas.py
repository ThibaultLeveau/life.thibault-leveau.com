from datetime import date, datetime
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

from life_app.platform.integrations.messages import tr

Frequency = Literal["daily", "weekly", "monthly", "yearly"]
Aggregation = Literal["count", "sum", "average", "min", "max", "latest", "change"]
Scalar = StrictBool | Annotated[float, Field(strict=True, allow_inf_nan=False)] | str


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)


class Option(Contract):
    id: str
    label: str


class OptionPage(Contract):
    items: list[Option]
    total: int
    offset: int = 0
    limit: int = 30


class FilterDefinition(Contract):
    id: str
    label: str
    kind: Literal["options", "select", "number", "boolean"] = "options"
    options: list[Option] = []
    minimum: float = 0
    maximum: float = 10000


class MetricDefinition(Contract):
    id: str
    label: str
    description: str
    unit: str = ""
    temporal: Literal["events", "current"] = "events"
    aggregations: list[Aggregation] = ["count"]
    filters: list[FilterDefinition] = []


class SourceDefinition(Contract):
    id: str
    name: str
    enabled: bool
    metrics: list[MetricDefinition]


class SourceQuery(Contract):
    application_id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,49}$")
    metric_id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,79}$")
    aggregation: Aggregation = "count"
    filters: dict[str, Scalar] = Field(default_factory=dict, max_length=8)

    @field_validator("filters")
    @classmethod
    def bounded_filters(cls, value):
        if any(len(k) > 60 or isinstance(v, str) and len(v) > 160 for k, v in value.items()):
            raise ValueError(tr("invalid_query"))
        return value


class DynamicSource(SourceQuery):
    period: Literal["tracking", "daily", "weekly", "monthly", "yearly"] = "tracking"


class Evaluation(SourceQuery):
    since: date
    until: date
    timezone: str = "Europe/Paris"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ValueError, ZoneInfoNotFoundError):
            raise ValueError(tr("timezone")) from None
        return value

    @model_validator(mode="after")
    def valid_range(self):
        if not date(2000, 1, 1) <= self.since <= self.until <= date(2100, 12, 31):
            raise ValueError(tr("range"))
        if (self.until - self.since).days > 3660:
            raise ValueError(tr("range"))
        return self


class MetricValue(Contract):
    value: float | None = None
    state: Literal["ok", "missing", "unavailable"] = "ok"
    unit: str = ""
    observed_at: datetime
    sample_count: int = 0
    message: str = ""


class Evaluated(Contract):
    query: Evaluation
    result: MetricValue
