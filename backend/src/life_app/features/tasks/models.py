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
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base, utcnow


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        CheckConstraint("position >= 0"),
        UniqueConstraint("id", "owner_id", name="uq_workspaces_id_owner"),
        ForeignKeyConstraint(
            ["parent_id", "owner_id"],
            ["workspaces.id", "workspaces.owner_id"],
            name="fk_workspaces_parent_owner",
        ),
        CheckConstraint("parent_id <> id", name="ck_workspaces_not_self_parent"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), index=True)
    parent_id: Mapped[UUID | None] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(7), default="#c05a45")
    position: Mapped[int] = mapped_column(default=0)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Section(Base):
    __tablename__ = "sections"
    __table_args__ = (
        UniqueConstraint("id", "workspace_id"),
        CheckConstraint("position >= 0"),
        CheckConstraint("visibility IN ('list', 'board', 'both')"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(7), default="#748b79")
    position: Mapped[int] = mapped_column(default=0)
    visibility: Mapped[str] = mapped_column(String(10), default="both")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Status(Base):
    __tablename__ = "task_statuses"
    __table_args__ = (UniqueConstraint("id", "workspace_id"), CheckConstraint("position >= 0"))
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    color: Mapped[str] = mapped_column(String(7), default="#748b79")
    position: Mapped[int] = mapped_column(default=0)
    is_completed: Mapped[bool] = mapped_column(default=False)


class Label(Base):
    __tablename__ = "task_labels"
    __table_args__ = (
        UniqueConstraint("id", "workspace_id"),
        UniqueConstraint("workspace_id", "name"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(7), default="#748b79")


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("id", "workspace_id"),
        ForeignKeyConstraint(
            ["section_id", "workspace_id"], ["sections.id", "sections.workspace_id"]
        ),
        ForeignKeyConstraint(
            ["status_id", "workspace_id"], ["task_statuses.id", "task_statuses.workspace_id"]
        ),
        CheckConstraint("priority BETWEEN 1 AND 4"),
        CheckConstraint("position >= 0"),
        CheckConstraint("version > 0"),
        Index("ix_tasks_workspace_section_position", "workspace_id", "section_id", "position"),
        Index("ix_tasks_workspace_status", "workspace_id", "status_id"),
        Index("ix_tasks_completed_at", "completed_at"),
        Index("ix_tasks_due_date", "due_date"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id"))
    section_id: Mapped[UUID | None]
    status_id: Mapped[UUID]
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[int] = mapped_column(default=4)
    due_date: Mapped[date | None] = mapped_column(Date)
    position: Mapped[int] = mapped_column(default=0)
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TaskLabel(Base):
    __tablename__ = "task_label_links"
    __table_args__ = (
        ForeignKeyConstraint(["task_id", "workspace_id"], ["tasks.id", "tasks.workspace_id"]),
        ForeignKeyConstraint(
            ["label_id", "workspace_id"], ["task_labels.id", "task_labels.workspace_id"]
        ),
    )
    task_id: Mapped[UUID] = mapped_column(primary_key=True)
    label_id: Mapped[UUID] = mapped_column(primary_key=True)
    workspace_id: Mapped[UUID]


class TaskEvent(Base):
    __tablename__ = "task_events"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('created','updated','moved','completed','reopened','archived','restored')"
        ),
        Index("ix_task_events_task_time", "task_id", "occurred_at"),
        Index("ix_task_events_resolution", "workspace_id", "kind", "occurred_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    task_id: Mapped[UUID] = mapped_column(ForeignKey("tasks.id"))
    kind: Mapped[str] = mapped_column(String(20))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    workspace_id: Mapped[UUID]
    section_id: Mapped[UUID | None]
    previous_status_id: Mapped[UUID | None]
    status_id: Mapped[UUID]
    was_completed: Mapped[bool]
    is_completed: Mapped[bool]
    context: Mapped[dict] = mapped_column(JSONB)


class ViewPreference(Base):
    __tablename__ = "view_preferences"
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id"), primary_key=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)


class AgendaPreference(Base):
    __tablename__ = "agenda_preferences"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
