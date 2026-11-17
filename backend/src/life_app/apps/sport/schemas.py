from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from life_app.apps.sport.messages import tr

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
    muscle_group: str = Field(
        default_factory=lambda: tr("default_muscle"), min_length=1, max_length=80
    )
    equipment: str = Field(
        default_factory=lambda: tr("default_equipment"), min_length=1, max_length=80
    )
    notes: str = Field("", max_length=4000)


class ExerciseUpdate(ExerciseInput, Version):
    pass


class ExerciseOutput(ExerciseInput):
    id: str
    builtin: bool = False
    muscle_id: str | None = None
    equipment_id: str | None = None
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


class TrainingEntry(SnapshotEntry):
    suggested_values: list[Values | None] = Field(
        default_factory=list,
        description=(
            "Derniers résultats enregistrés par série du même programme, exercice, type et "
            "occurrence, y compris les entraînements abandonnés. Figés au démarrage ; "
            "null sans résultat antérieur, liste vide pour les anciens instantanés. "
            "Ce sont des propositions, jamais des séries validées."
        ),
    )


class WorkoutInput(Contract):
    name: Name
    competition_date: date | None = Field(
        None,
        description=(
            "Date civile de compétition facultative (YYYY-MM-DD), sans heure ni fuseau. "
            "Affichée avec le branding si le titre contient Hyrox, sans distinction de casse. "
            "null ou omission lors d'un remplacement efface la date."
        ),
    )
    notes: str = Field("", max_length=4000)
    entries: list[TemplateEntry] = Field(min_length=1, max_length=50)

    @field_validator("competition_date", mode="before")
    @classmethod
    def calendar_date(cls, value):
        if value is None or type(value) is date:
            return value
        if not isinstance(value, str) or len(value) != 10:
            raise ValueError(tr("competition_date_format"))
        try:
            parsed = date.fromisoformat(value)
        except ValueError:
            raise ValueError(tr("competition_date_format")) from None
        if parsed.isoformat() != value:
            raise ValueError(tr("competition_date_format"))
        return parsed

    @model_validator(mode="after")
    def limit_sets(self):
        if sum(entry.sets for entry in self.entries) > 300:
            raise ValueError(tr("a_program_can_contain_up_to_300_sets"))
        return self


class WorkoutUpdate(WorkoutInput, Version):
    pass


class WorkoutOutput(Contract):
    id: UUID
    name: str
    competition_date: date | None
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


class SetResultValues(Values):
    """Saved results also represent sets left unperformed when finishing."""

    reps: int | None = Field(None, ge=0, le=100000, strict=True)
    duration_seconds: float | None = Field(None, ge=0, le=604800, allow_inf_nan=False)
    distance_m: float | None = Field(None, ge=0, le=10000000, allow_inf_nan=False)
    calories: float | None = Field(None, ge=0, le=100000, allow_inf_nan=False)


class SetOutput(Contract):
    entry_index: int
    set_index: int
    values: SetResultValues
    completed_at: datetime
    skipped: bool = Field(
        False,
        description=(
            "Série non effectuée, ajoutée à la fin avec toutes ses mesures à zéro. "
            "completed_at indique alors la fin de séance. Exclue du nombre de séries "
            "effectuées et des propositions suivantes. false pour les séries validées "
            "et les anciens résultats."
        ),
    )


class SessionFinish(Version):
    outcome: Literal["completed", "cancelled"] = Field(
        description=(
            "completed termine la séance et enregistre les séries non validées à zéro ; "
            "cancelled conserve uniquement les séries validées, sans score ni statistiques."
        )
    )
    notes: str = Field("", max_length=4000)


class ScoreReference(Contract):
    values: dict[str, float] = Field(
        description="Référence figée par mesure ; champs inconnus absents jusqu’à réalisation."
    )
    sources: dict[str, Literal["target", "history", "initial"]]


class ScoreMetric(Contract):
    version: Literal[2] = 2
    planned_sets: int
    completed_sets: int
    effort_ratio_sum: float
    references: list[ScoreReference]


class ScoreSummary(Contract):
    version: Literal[2] = 2
    planned_sets: int
    completed_sets: int
    completion_percent: float
    difficulty_percent: float | None
    score: float


class ScoreBackfill(Contract):
    updated_sessions: int


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
    scoring: ScoreMetric | None = Field(
        None, description="Calcul v2 conservé à la fin ; null pour les anciens scores v1."
    )


class TrainingOutput(Contract):
    id: UUID
    workout_id: UUID
    name: str
    competition_date: date | None = Field(
        description="Date de compétition figée au démarrage ; null pour les anciens entraînements."
    )
    entries: list[TrainingEntry]
    sets: list[SetOutput]
    status: Literal["active", "completed", "cancelled"]
    version: int
    started_at: datetime
    finished_at: datetime | None
    rest_until: datetime | None
    notes: str
    score: float | None = Field(
        description="Score v2 = complétion × difficulté relative / 100 ; zéro si rien réalisé."
    )
    score_details: ScoreSummary | None = Field(
        None, description="Résumé v2 des métriques persistées ; null pour les anciens scores v1."
    )
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
            raise ValueError(tr("a_body_measurement_cannot_have_a_future_date"))
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
            raise ValueError(tr("enter_at_least_one_body_measurement"))
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
