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


class Tracker(Base):
    __tablename__ = "tracking_trackers"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        CheckConstraint("version > 0 AND position >= 0"),
        CheckConstraint("jsonb_typeof(definition) = 'object'"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    version: Mapped[int] = mapped_column(default=1)
    position: Mapped[int] = mapped_column(default=0)
    definition: Mapped[dict] = mapped_column(JSONB)
    effective_from: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TrackerRevision(Base):
    __tablename__ = "tracking_definitions"
    __table_args__ = (
        CheckConstraint("revision > 0"),
        CheckConstraint("jsonb_typeof(definition) = 'object'"),
        Index("ix_tracking_definition_date", "tracker_id", "effective_from"),
    )
    tracker_id: Mapped[UUID] = mapped_column(ForeignKey("tracking_trackers.id"), primary_key=True)
    revision: Mapped[int] = mapped_column(primary_key=True)
    effective_from: Mapped[date] = mapped_column(Date)
    enabled: Mapped[bool]
    definition: Mapped[dict] = mapped_column(JSONB)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Entry(Base):
    __tablename__ = "tracking_entries"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        UniqueConstraint("tracker_id", "period_start"),
        ForeignKeyConstraint(
            ["tracker_id", "owner_id"], ["tracking_trackers.id", "tracking_trackers.owner_id"]
        ),
        CheckConstraint("version > 0 AND period_end >= period_start"),
        CheckConstraint("status IN ('draft','complete')"),
        CheckConstraint("(status = 'complete') = (completed_at IS NOT NULL)"),
        CheckConstraint(
            "jsonb_typeof(definition) = 'object' AND jsonb_typeof(values) = 'object' "
            "AND jsonb_typeof(sources) = 'object'"
        ),
        Index("ix_tracking_entries_owner_period", "owner_id", "period_start"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    tracker_id: Mapped[UUID]
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    definition: Mapped[dict] = mapped_column(JSONB)
    values: Mapped[dict] = mapped_column(JSONB, default=dict)
    sources: Mapped[dict] = mapped_column(JSONB, default=dict)
    version: Mapped[int] = mapped_column(default=1)
    status: Mapped[str] = mapped_column(String(10), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EntryRevision(Base):
    __tablename__ = "tracking_entry_revisions"
    __table_args__ = (
        CheckConstraint("version > 0"),
        CheckConstraint("jsonb_typeof(snapshot) = 'object'"),
    )
    entry_id: Mapped[UUID] = mapped_column(ForeignKey("tracking_entries.id"), primary_key=True)
    version: Mapped[int] = mapped_column(primary_key=True)
    snapshot: Mapped[dict] = mapped_column(JSONB)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TrackingSettings(Base):
    __tablename__ = "tracking_settings"
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    timezone: Mapped[str] = mapped_column(String(100), default="Europe/Paris")
