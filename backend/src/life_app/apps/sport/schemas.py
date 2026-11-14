from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Kind = Literal[
    "weight_reps",
    "reps",
    "assisted_reps",
    "duration",
    "distance_duration",
    "weight_distance",
    "weight_duration",
    "reps_duration",
    "distance",
    "calories_duration",
]
Name = Annotated[str, Field(min_length=1, max_length=160)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)


class Version(Contract):
    expected_version: int = Field(ge=1)


class Archive(Version):
    archived: bool


class Values(Contract):
    weight_kg: float | None = Field(None, ge=0, le=2000, allow_inf_nan=False)
    reps: int | None = Field(None, ge=1, le=100000, strict=True)
    assistance_kg: float | None = Field(None, ge=0, le=500, allow_inf_nan=False)
    duration_seconds: float | None = Field(None, gt=0, le=604800, allow_inf_nan=False)
    distance_m: float | None = Field(None, gt=0, le=10000000, allow_inf_nan=False)
    calories: float | None = Field(None, gt=0, le=100000, allow_inf_nan=False)


class ExerciseInput(Contract):
    name: Name
    kind: Kind
    muscle_group: str = Field("Général", min_length=1, max_length=80)
    equipment: str = Field("Sans matériel", min_length=1, max_length=80)
    notes: str = Field("", max_length=4000)


class ExerciseUpdate(ExerciseInput, Version):
    pass


class ExerciseOutput(ExerciseInput):
    id: str
    builtin: bool = False
    aliases: list[str] = []
    archived_at: datetime | None = None
    version: int = 1


class ExercisePage(Contract):
    items: list[ExerciseOutput]
    total: int
    offset: int
    limit: int


class FieldDefinition(Contract):
    key: str
    label: str
    unit: str
    minimum: float
    maximum: float
    step: float


class KindDefinition(Contract):
    id: Kind
    name: str
    fields: list[FieldDefinition]
    metric: str
    metric_unit: str


class TemplateEntry(Contract):
    exercise_id: str = Field(min_length=1, max_length=100)
    sets: int = Field(3, ge=1, le=30)
    target: Values = Field(default_factory=Values)


class SnapshotEntry(TemplateEntry):
    name: str
    kind: Kind


class WorkoutInput(Contract):
    name: Name
    notes: str = Field("", max_length=4000)
    entries: list[TemplateEntry] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def limit_sets(self):
        if sum(entry.sets for entry in self.entries) > 300:
            raise ValueError("Une séance contient au maximum 300 séries.")
        return self


class WorkoutUpdate(WorkoutInput, Version):
    pass


class WorkoutOutput(Contract):
    id: UUID
    name: str
    notes: str
    entries: list[SnapshotEntry]
    version: int
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class Settings(Contract):
    rest_seconds: int = Field(90, ge=0, le=3600, strict=True)


class SessionStart(Contract):
    workout_id: UUID
    expected_version: int = Field(ge=1)


class SetInput(Version):
    values: Values


class SetOutput(Contract):
    entry_index: int
    set_index: int
    values: Values
    completed_at: datetime


class SessionFinish(Version):
    outcome: Literal["completed", "cancelled"]
    notes: str = Field("", max_length=4000)


class Metric(Contract):
    exercise_id: str
    name: str
    kind: Kind
    value: float
    unit: str
    volume_kg: float
    reps: int
    distance_m: float
    duration_seconds: float


class TrainingOutput(Contract):
    id: UUID
    workout_id: UUID
    name: str
    entries: list[SnapshotEntry]
    sets: list[SetOutput]
    status: Literal["active", "completed", "cancelled"]
    version: int
    started_at: datetime
    finished_at: datetime | None
    rest_until: datetime | None
    notes: str
    score: float | None
    baseline_id: UUID | None
    metrics: list[Metric]
    server_now: datetime


class SessionPage(Contract):
    items: list[TrainingOutput]
    total: int
    offset: int
    limit: int


class MeasurementInput(Contract):
    measured_on: date
    weight_kg: float | None = Field(None, gt=0, le=1000, allow_inf_nan=False)
    body_fat_pct: float | None = Field(None, gt=0, lt=100, allow_inf_nan=False)
    neck_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    shoulders_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    chest_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    waist_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    hips_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    arm_left_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    arm_right_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    thigh_left_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    thigh_right_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    calf_left_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    calf_right_cm: float | None = Field(None, gt=0, le=500, allow_inf_nan=False)
    notes: str = Field("", max_length=2000)

    @model_validator(mode="after")
    def has_measurement(self):
        if self.measured_on > date.today():
            raise ValueError("Une mensuration ne peut pas être datée dans le futur.")
        if not any(
            v is not None
            for k, v in self.model_dump().items()
            if k
            not in {
                "measured_on",
                "notes",
                "expected_version",
                "id",
                "version",
                "created_at",
                "updated_at",
                "archived_at",
            }
        ):
            raise ValueError("Renseignez au moins une mensuration.")
        return self


class MeasurementUpdate(MeasurementInput, Version):
    pass


class MeasurementOutput(MeasurementInput):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class Statistics(Contract):
    completed_sessions: int
    total_sets: int
    total_volume_kg: float
    total_distance_m: float
    sessions: list[TrainingOutput]
    measurements: list[MeasurementOutput]
    since: date
    until: date
