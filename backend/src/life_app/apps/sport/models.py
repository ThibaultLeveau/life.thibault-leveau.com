from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base, utcnow


class Owned:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Exercise(Owned, Base):
    __tablename__ = "sport_exercises"
    __table_args__ = (CheckConstraint("version > 0"), CheckConstraint("length(trim(name)) > 0"))
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(30))
    muscle_group: Mapped[str] = mapped_column(String(80))
    equipment: Mapped[str] = mapped_column(String(80))
    notes: Mapped[str] = mapped_column(Text, default="")


class Workout(Owned, Base):
    __tablename__ = "sport_workouts"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        CheckConstraint("version > 0"),
        CheckConstraint("length(trim(name)) > 0"),
        CheckConstraint(
            "jsonb_typeof(entries) = 'array' AND jsonb_array_length(entries) BETWEEN 1 AND 50"
        ),
    )
    name: Mapped[str] = mapped_column(String(160))
    notes: Mapped[str] = mapped_column(Text, default="")
    entries: Mapped[list] = mapped_column(JSONB)


class Training(Base):
    __tablename__ = "sport_sessions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workout_id", "owner_id"], ["sport_workouts.id", "sport_workouts.owner_id"]
        ),
        CheckConstraint("status IN ('active', 'completed', 'cancelled')"),
        CheckConstraint("version > 0"),
        CheckConstraint(
            "(status = 'active' AND finished_at IS NULL) OR "
            "(status <> 'active' AND finished_at IS NOT NULL "
            "AND finished_at >= started_at AND rest_until IS NULL)"
        ),
        CheckConstraint("score IS NULL OR (score >= 0 AND status = 'completed')"),
        CheckConstraint("jsonb_typeof(entries) = 'array' AND jsonb_typeof(sets) = 'array'"),
        Index(
            "uq_sport_active_session",
            "owner_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("ix_sport_session_history", "owner_id", "started_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    workout_id: Mapped[UUID] = mapped_column()
    name: Mapped[str] = mapped_column(String(160))
    entries: Mapped[list] = mapped_column(JSONB)
    sets: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(12), default="active")
    version: Mapped[int] = mapped_column(default=1)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rest_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str] = mapped_column(Text, default="")
    signature: Mapped[str] = mapped_column(String(64), index=True)
    score: Mapped[float | None] = mapped_column()
    baseline_id: Mapped[UUID | None] = mapped_column(ForeignKey("sport_sessions.id"))
    metrics: Mapped[list] = mapped_column(JSONB, default=list)


class SportSettings(Base):
    __tablename__ = "sport_settings"
    __table_args__ = (CheckConstraint("rest_seconds BETWEEN 0 AND 3600"),)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    rest_seconds: Mapped[int] = mapped_column(default=90)


class Measurement(Owned, Base):
    __tablename__ = "sport_measurements"
    __table_args__ = (
        CheckConstraint("version > 0"),
        CheckConstraint("jsonb_typeof(values) = 'object'"),
        Index(
            "uq_sport_measurement_day",
            "owner_id",
            "measured_on",
            unique=True,
            postgresql_where=text("archived_at IS NULL"),
        ),
    )
    measured_on: Mapped[date] = mapped_column(Date)
    values: Mapped[dict] = mapped_column(JSONB)
    notes: Mapped[str] = mapped_column(Text, default="")
