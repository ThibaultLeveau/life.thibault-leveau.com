from fastapi import HTTPException
from sqlalchemy import func, select

from life_app.apps.recipes.messages import tr
from life_app.apps.recipes.models import Event
from life_app.core.database import utcnow
from life_app.platform.integrations.periods import utc_window
from life_app.platform.integrations.schemas import MetricDefinition, MetricValue

KINDS = {
    "recipes": "recipe_created",
    "lists": "completed",
    "imports": "recipe_imported",
    "templates": "template_ready",
}


class RecipesMetrics:
    def catalogue(self):
        return [
            MetricDefinition(
                id=id, label=tr("metric_" + id), description=tr("metric_" + id + "_description")
            )
            for id in KINDS
        ]

    def options(self, db, user, filter_id, q, offset, limit):
        raise HTTPException(404, tr("not_found"))

    def evaluate(self, db, user, query):
        start, end = utc_window(query.since, query.until, query.timezone)
        count = db.scalar(
            select(func.count())
            .select_from(Event)
            .where(
                Event.owner_id == user.id,
                Event.kind == KINDS[query.metric_id],
                Event.reward_key.is_not(None),
                Event.occurred_at >= start,
                Event.occurred_at < end,
            )
        )
        return MetricValue(value=count, sample_count=count, observed_at=utcnow())


provider = RecipesMetrics()
