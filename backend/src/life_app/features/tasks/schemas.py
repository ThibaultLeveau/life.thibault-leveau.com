from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Name = Annotated[str, Field(min_length=1, max_length=120)]
Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
Description = Annotated[str, Field(max_length=20000)]


class Schema(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)


class Patch(Schema):
    @model_validator(mode="after")
    def reject_null_required_fields(self):
        for field in self.model_fields_set - {"section_id", "due_date"}:
            if getattr(self, field) is None:
                raise ValueError(f"{field} ne peut pas être null")
        return self


class WorkspaceCreate(Schema):
    name: Name
    description: Description = ""
    color: Color = "#c05a45"


class WorkspacePatch(Patch):
    name: Name | None = None
    description: Description | None = None
    color: Color | None = None
    archived: bool | None = None


class WorkspaceOutput(WorkspaceCreate):
    id: UUID
    position: int
    archived_at: datetime | None
    created_at: datetime


class SectionCreate(Schema):
    name: Name
    description: Description = ""
    color: Color = "#748b79"
    visibility: Literal["list", "board", "both"] = "both"


class SectionPatch(WorkspacePatch):
    visibility: Literal["list", "board", "both"] | None = None


class SectionOutput(SectionCreate):
    id: UUID
    workspace_id: UUID
    position: int
    archived_at: datetime | None


class StatusCreate(Schema):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    color: Color = "#748b79"
    is_completed: bool = False


class StatusPatch(Patch):
    name: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    color: Color | None = None
    is_completed: bool | None = None


class StatusOutput(StatusCreate):
    id: UUID
    workspace_id: UUID
    position: int


class LabelCreate(Schema):
    name: Annotated[str, Field(min_length=1, max_length=50)]
    color: Color = "#748b79"


class LabelOutput(LabelCreate):
    id: UUID
    workspace_id: UUID


class Reorder(Schema):
    ids: list[UUID] = Field(max_length=10000)


class ViewSettings(Schema):
    layout: Literal["list", "board"] = "list"
    density: Literal["comfortable", "compact"] = "comfortable"
    show_completed: bool = True
    search: str = Field(default="", max_length=500)
    sort: Literal["manual", "priority", "due_date"] = "manual"
    status_id: UUID | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    label_id: UUID | None = None
    due: Literal["all", "overdue", "today", "upcoming", "none"] = "all"


class TaskCreate(Schema):
    workspace_id: UUID
    section_id: UUID | None = None
    status_id: UUID | None = None
    title: Annotated[str, Field(min_length=1, max_length=500)]
    description: Description = ""
    priority: int = Field(default=4, ge=1, le=4)
    due_date: date | None = None
    label_ids: list[UUID] = Field(default_factory=list, max_length=100)


class TaskPatch(Patch):
    expected_version: int = Field(ge=1)
    section_id: UUID | None = None
    status_id: UUID | None = None
    title: Annotated[str, Field(min_length=1, max_length=500)] | None = None
    description: Description | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    due_date: date | None = None
    label_ids: list[UUID] | None = Field(default=None, max_length=100)
    archived: bool | None = None


class VersionInput(Schema):
    expected_version: int = Field(ge=1)


class MoveInput(VersionInput):
    workspace_id: UUID
    section_id: UUID | None = None
    status_id: UUID
    before_id: UUID | None = None


class TaskOutput(Schema):
    id: UUID
    workspace_id: UUID
    section_id: UUID | None
    status_id: UUID
    title: str
    description: str
    priority: int
    due_date: date | None
    label_ids: list[UUID] = Field(default_factory=list)
    position: int
    version: int
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    archived_at: datetime | None


class TaskPage(Schema):
    items: list[TaskOutput]
    total: int
    offset: int
    limit: int


class EventOutput(Schema):
    id: UUID
    task_id: UUID
    kind: str
    occurred_at: datetime
    workspace_id: UUID
    section_id: UUID | None
    previous_status_id: UUID | None
    status_id: UUID
    was_completed: bool
    is_completed: bool
    context: dict


class EventPage(Schema):
    items: list[EventOutput]
    total: int
    offset: int
    limit: int
