"""Task metrics retain event-time context and distinguish recurring cycles from reports."""

from collections import Counter
from datetime import date
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import String, cast, func, or_, select

from life_app.apps.tasks import models as m
from life_app.apps.tasks.messages import tr
from life_app.core.database import utcnow
from life_app.platform.integrations.messages import tr as common
from life_app.platform.integrations.periods import utc_window
from life_app.platform.integrations.schemas import (
    FilterDefinition,
    MetricDefinition,
    MetricValue,
    Option,
    OptionPage,
)
from life_app.platform.integrations.service import aggregate, bounded

EVENTS = {
    "created",
    "completed",
    "completed_distinct",
    "reopened",
    "completion_undone",
    "moved",
    "archived",
    "restored",
    "rescheduled",
    "rescheduled_tasks",
    "late_days",
    "resolution_days",
    "on_time_rate",
}
CURRENT = {"open", "closed", "overdue", "due", "recurring", "archived_current"}


def option_id(value):
    try:
        return UUID(value)
    except (ValueError, TypeError):
        raise HTTPException(404, common("not_found")) from None


def filters(current=False):
    result = [
        FilterDefinition(id=k, label=tr("integration_" + k))
        for k in ("workspace_id", "section_id", "status_id")
    ]
    result.append(
        FilterDefinition(id="recurring", label=tr("integration_recurring"), kind="boolean")
    )
    if current:
        result += [
            FilterDefinition(id="label_id", label=tr("integration_label_id")),
            FilterDefinition(
                id="priority",
                label=tr("integration_priority"),
                kind="select",
                options=[Option(id=str(n), label=str(n)) for n in range(1, 5)],
            ),
        ]
    else:
        result.append(
            FilterDefinition(
                id="due_state",
                label=tr("integration_due_state"),
                kind="select",
                options=[
                    Option(id=k, label=tr("integration_" + k))
                    for k in ("late", "on_time", "undated")
                ],
            )
        )
    return result


class TasksMetrics:
    def catalogue(self):
        result = []
        for key in sorted(EVENTS | CURRENT):
            fs = filters(key in CURRENT)
            if key in {"rescheduled", "rescheduled_tasks"}:
                fs.append(
                    FilterDefinition(
                        id="reports_more_than",
                        label=tr("integration_reports_more_than"),
                        kind="number",
                        maximum=10000,
                    )
                )
            measurement = key in {"late_days", "resolution_days"}
            result.append(
                MetricDefinition(
                    id=key,
                    label=tr("metric_" + key),
                    description=tr("metric_" + key + "_description"),
                    unit="%" if key == "on_time_rate" else "d" if measurement else "",
                    temporal="current" if key in CURRENT else "events",
                    aggregations=["average", "sum", "min", "max"] if measurement else ["count"],
                    filters=fs,
                )
            )
        return result

    def options(self, db, user, filter_id, q, offset, limit):
        model = {
            "workspace_id": m.Workspace,
            "section_id": m.Section,
            "status_id": m.Status,
            "label_id": m.Label,
        }.get(filter_id)
        if model is None:
            raise HTTPException(404, common("not_found"))
        query = select(model)
        if model is m.Workspace:
            query = query.where(model.owner_id == user.id)
        else:
            query = query.join(m.Workspace, model.workspace_id == m.Workspace.id).where(
                m.Workspace.owner_id == user.id
            )
        query = query.where(or_(model.name.ilike("%" + q + "%"), cast(model.id, String) == q))
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        rows = db.scalars(query.order_by(model.name, model.id).offset(offset).limit(limit))
        return OptionPage(
            items=[Option(id=str(row.id), label=row.name) for row in rows],
            total=total,
            offset=offset,
            limit=limit,
        )

    def references(self, db, user, fs):
        for key in ("workspace_id", "section_id", "status_id", "label_id"):
            if key not in fs:
                continue
            model = {
                "workspace_id": m.Workspace,
                "section_id": m.Section,
                "status_id": m.Status,
                "label_id": m.Label,
            }[key]
            query = select(model).where(model.id == option_id(fs[key]))
            query = (
                query.where(model.owner_id == user.id)
                if model is m.Workspace
                else query.join(m.Workspace, model.workspace_id == m.Workspace.id).where(
                    m.Workspace.owner_id == user.id
                )
            )
            if db.scalar(query) is None:
                raise HTTPException(404, common("not_found"))

    def evaluate(self, db, user, query):
        self.references(db, user, query.filters)
        if query.metric_id in CURRENT:
            value, count = self.current(db, user, query)
        else:
            value, count = self.events(db, user, query)
        return MetricValue(
            value=value,
            state="missing" if value is None else "ok",
            sample_count=count,
            observed_at=utcnow(),
        )

    def current(self, db, user, query):
        fs = query.filters
        sql = (
            select(m.Task)
            .join(m.Workspace, m.Task.workspace_id == m.Workspace.id)
            .join(m.Status, m.Task.status_id == m.Status.id)
            .outerjoin(m.Section, m.Task.section_id == m.Section.id)
            .where(m.Workspace.owner_id == user.id)
        )
        archived = (
            m.Task.archived_at.is_not(None)
            | m.Workspace.archived_at.is_not(None)
            | m.Section.archived_at.is_not(None)
        )
        sql = sql.where(archived if query.metric_id == "archived_current" else ~archived)
        for key in ("workspace_id", "section_id", "status_id"):
            if key in fs:
                sql = sql.where(getattr(m.Task, key) == option_id(fs[key]))
        if "priority" in fs:
            sql = sql.where(m.Task.priority == int(fs["priority"]))
        if "recurring" in fs:
            sql = sql.where(
                m.Task.recurrence.is_not(None) if fs["recurring"] else m.Task.recurrence.is_(None)
            )
        if "label_id" in fs:
            sql = sql.where(
                m.Task.id.in_(
                    select(m.TaskLabel.task_id).where(
                        m.TaskLabel.label_id == option_id(fs["label_id"])
                    )
                )
            )
        today = utcnow().astimezone(ZoneInfo(query.timezone)).date()
        if query.metric_id in {"open", "overdue", "due"}:
            sql = sql.where(m.Status.is_completed.is_(False))
        if query.metric_id == "closed":
            sql = sql.where(m.Status.is_completed.is_(True))
        if query.metric_id == "overdue":
            sql = sql.where(m.Task.due_date < today)
        if query.metric_id == "due":
            sql = sql.where(m.Task.due_date >= query.since, m.Task.due_date <= query.until)
        if query.metric_id == "recurring":
            sql = sql.where(m.Task.recurrence.is_not(None))
        count = db.scalar(select(func.count()).select_from(sql.subquery()))
        return float(count), count

    def events(self, db, user, query):
        start, end = utc_window(query.since, query.until, query.timezone)
        key = query.metric_id
        kind = (
            "completed"
            if key in {"completed_distinct", "late_days", "resolution_days", "on_time_rate"}
            else key
        )
        sql = (
            select(m.TaskEvent, m.Task.created_at)
            .join(m.Workspace, m.TaskEvent.workspace_id == m.Workspace.id)
            .join(m.Task, m.TaskEvent.task_id == m.Task.id)
            .where(
                m.Workspace.owner_id == user.id,
                m.TaskEvent.occurred_at >= start,
                m.TaskEvent.occurred_at < end,
            )
        )
        if key in {"rescheduled", "rescheduled_tasks"}:
            sql = sql.where(
                m.TaskEvent.kind.not_in(["rescheduled", "completion_undone", "completed"])
            )
        else:
            sql = sql.where(m.TaskEvent.kind == kind)
        if kind == "completed":
            undone = select(m.TaskEvent.context["completion_event_id"].astext).where(
                m.TaskEvent.kind == "completion_undone",
                m.TaskEvent.context["completion_event_id"].astext.is_not(None),
            )
            sql = sql.where(cast(m.TaskEvent.id, String).not_in(undone))
        fs = query.filters
        for field in ("workspace_id", "section_id", "status_id"):
            if field in fs:
                sql = sql.where(getattr(m.TaskEvent, field) == option_id(fs[field]))
        rows = bounded(
            db.execute(sql.order_by(m.TaskEvent.occurred_at, m.TaskEvent.id).limit(20001)).all()
        )
        selected = []
        zone = ZoneInfo(query.timezone)
        for event, created_at in rows:
            before = event.context.get("before") or {}
            after = event.context.get("after") or {}
            if key in {"rescheduled", "rescheduled_tasks"} and (
                not before or before.get("due_date") == after.get("due_date")
            ):
                continue
            if "recurring" in fs and bool(after.get("recurrence")) != fs["recurring"]:
                continue
            due = date.fromisoformat(after["due_date"]) if after.get("due_date") else None
            local_day = event.occurred_at.astimezone(zone).date()
            due_state = "undated" if due is None else "late" if due < local_day else "on_time"
            if fs.get("due_state") and fs["due_state"] != due_state:
                continue
            selected.append((event, created_at, due, local_day))
        if "reports_more_than" in fs:
            counts = Counter(e.task_id for e, *_ in selected)
            selected = [row for row in selected if counts[row[0].task_id] > fs["reports_more_than"]]
        if key in {"completed_distinct", "rescheduled_tasks"}:
            count = len({e.task_id for e, *_ in selected})
            return float(count), len(selected)
        if key == "on_time_rate":
            dated = [row for row in selected if row[2] is not None]
            return (
                100 * sum(day <= due for _, _, due, day in dated) / len(dated) if dated else None
            ), len(dated)
        if key == "late_days":
            values = [float(max(0, (day - due).days)) for _, _, due, day in selected if due]
        elif key == "resolution_days":
            values = [
                max(0, (e.occurred_at - created).total_seconds() / 86400)
                for e, created, *_ in selected
            ]
        else:
            values = [1 for _ in selected]
        return aggregate(values, query.aggregation), len(values)
