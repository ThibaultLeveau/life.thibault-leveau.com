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
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base, utcnow


class Objective(Base):
    __tablename__ = "okr_objectives"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        ForeignKeyConstraint(
            ["parent_id", "owner_id"], ["okr_objectives.id", "okr_objectives.owner_id"]
        ),
        CheckConstraint("version > 0 AND position >= 0"),
        CheckConstraint("length(trim(title)) > 0"),
        CheckConstraint("domain IN ('personal','professional')"),
        CheckConstraint("horizon IN ('ten_year','three_year','annual','quarterly')"),
        CheckConstraint("status IN ('backlog','in_progress','done')"),
        CheckConstraint(
            "(status = 'done') = (completed_at IS NOT NULL) AND (completed_at IS "
            "NULL) = (completed_quarter IS NULL)"
        ),
        CheckConstraint(
            "(start_date IS NULL AND due_date IS NULL) OR (start_date IS NOT NULL"
            " AND due_date IS NOT NULL AND start_date <= due_date)"
        ),
        CheckConstraint("horizon = 'ten_year' OR length(trim(why)) > 0"),
        CheckConstraint("horizon NOT IN ('annual','quarterly') OR length(trim(outcome)) > 0"),
        CheckConstraint(
            "horizon <> 'quarterly' OR (start_date IS NOT NULL AND due_date < "
            "start_date + INTERVAL '1 month' AND length(trim(first_action)) > 0 "
            "AND jsonb_array_length(key_results) > 0)"
        ),
        CheckConstraint(
            "jsonb_typeof(key_results) = 'array' AND jsonb_array_length(key_results) <= 12"
        ),
        Index("ix_okr_objectives_owner", "owner_id", "archived_at", "horizon", "position"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    parent_id: Mapped[UUID | None]
    version: Mapped[int] = mapped_column(default=1)
    title: Mapped[str] = mapped_column(String(200))
    domain: Mapped[str] = mapped_column(String(20))
    horizon: Mapped[str] = mapped_column(String(20))
    why: Mapped[str] = mapped_column(String(2000), default="")
    outcome: Mapped[str] = mapped_column(String(2000), default="")
    first_action: Mapped[str] = mapped_column(String(1000), default="")
    start_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    key_results: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(20), default="backlog")
    position: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_quarter: Mapped[str | None] = mapped_column(String(7))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Event(Base):
    __tablename__ = "okr_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["objective_id", "owner_id"], ["okr_objectives.id", "okr_objectives.owner_id"]
        ),
        CheckConstraint(
            "kind IN ('created','updated','check_in','key_result_reached','moved'"
            ",'completed','reopened','archived','restored')"
        ),
        CheckConstraint("jsonb_typeof(snapshot) = 'object' AND jsonb_typeof(detail) = 'object'"),
        Index("ix_okr_events_owner_quarter", "owner_id", "quarter", "occurred_at"),
        Index("ix_okr_events_objective", "objective_id", "occurred_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    objective_id: Mapped[UUID]
    kind: Mapped[str] = mapped_column(String(24))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    quarter: Mapped[str] = mapped_column(String(7))
    snapshot: Mapped[dict] = mapped_column(JSONB)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)


class OkrSettings(Base):
    __tablename__ = "okr_settings"
    __table_args__ = (CheckConstraint("version > 0"),)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    timezone: Mapped[str] = mapped_column(String(100))
    version: Mapped[int] = mapped_column(default=1)
