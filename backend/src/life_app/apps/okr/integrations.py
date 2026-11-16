"""Read immutable OKR facts through the approved integration contract."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import Integer, String, cast, func, or_, select

from life_app.apps.okr import models as m
from life_app.apps.okr.messages import tr
from life_app.core.database import utcnow
from life_app.platform.integrations.periods import utc_window
from life_app.platform.integrations.schemas import (
    FilterDefinition,
    MetricDefinition,
    MetricValue,
    Option,
    OptionPage,
)


class OkrMetrics:
    def catalogue(self):
        filters = [
            FilterDefinition(
                id="domain",
                label=tr("domain"),
                kind="select",
                options=[Option(id=id, label=tr(id)) for id in ("personal", "professional")],
            ),
            FilterDefinition(
                id="horizon",
                label=tr("horizon"),
                kind="select",
                options=[
                    Option(id=id, label=tr(id))
                    for id in ("ten_year", "three_year", "annual", "quarterly")
                ],
            ),
            FilterDefinition(id="objective_id", label=tr("objective")),
        ]
        return [
            MetricDefinition(
                id=id,
                label=tr("metric_" + id),
                description=tr("metric_" + id + "_description"),
                filters=filters,
            )
            for id in ("completed", "key_results", "check_ins")
        ]

    def options(self, db, user, filter_id, q, offset, limit):
        if filter_id != "objective_id":
            raise HTTPException(404, tr("not_found"))
        query = select(m.Objective).where(
            m.Objective.owner_id == user.id,
            or_(m.Objective.title.ilike("%" + q + "%"), cast(m.Objective.id, String) == q),
        )
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        rows = db.scalars(
            query.order_by(m.Objective.title, m.Objective.id).offset(offset).limit(limit)
        )
        return OptionPage(
            items=[Option(id=str(o.id), label=o.title) for o in rows],
            total=total,
            offset=offset,
            limit=limit,
        )

    def evaluate(self, db, user, query):
        from life_app.apps.okr.service import owned

        if "objective_id" in query.filters:
            try:
                id = UUID(query.filters["objective_id"])
            except ValueError:
                raise HTTPException(422, tr("invalid")) from None
            owned(db, user, id)
        kind = {
            "completed": "completed",
            "key_results": "key_result_reached",
            "check_ins": "check_in",
        }[query.metric_id]
        partition = [m.Event.objective_id]
        if kind == "key_result_reached":
            partition.append(m.Event.detail["key_result_id"].astext)
        if kind == "check_in":
            partition = [m.Event.id]
        # Deduplicate BEFORE date and snapshot filters: reopening cannot create a new first success.
        first = (
            select(
                m.Event,
                func.row_number()
                .over(
                    partition_by=partition,
                    order_by=(
                        m.Event.snapshot["version"].astext.cast(Integer),
                        m.Event.occurred_at,
                        m.Event.id,
                    ),
                )
                .label("occurrence"),
            )
            .where(m.Event.owner_id == user.id, m.Event.kind == kind)
            .subquery()
        )
        start, end = utc_window(query.since, query.until, query.timezone)
        sql = (
            select(func.count())
            .select_from(first)
            .where(first.c.occurrence == 1, first.c.occurred_at >= start, first.c.occurred_at < end)
        )
        for key, value in query.filters.items():
            sql = (
                sql.where(first.c.objective_id == UUID(value))
                if key == "objective_id"
                else sql.where(first.c.snapshot[key].astext == value)
            )
        count = db.scalar(sql)
        return MetricValue(value=count, sample_count=count, observed_at=utcnow())


provider = OkrMetrics()
