from zoneinfo import ZoneInfo

from fastapi import HTTPException

from life_app.core.database import utcnow
from life_app.platform.applications.models import ApplicationPreference
from life_app.platform.applications.service import find_application
from life_app.platform.integrations.messages import tr
from life_app.platform.integrations.schemas import (
    Evaluation,
    MetricValue,
    SourceDefinition,
    SourceQuery,
)


def active(db, user, definition):
    preference = db.get(ApplicationPreference, (user.id, definition.id))
    return preference.enabled if preference else definition.default_enabled


def catalogue(db, user, definitions):
    return [
        SourceDefinition(
            id=d.id,
            name=d.localized_metadata()[0],
            enabled=active(db, user, d),
            metrics=d.metrics.catalogue(),
        )
        for d in definitions
        if d.metrics is not None
    ]


def provider(db, user, definitions, application_id):
    definition = find_application(definitions, application_id)
    if definition.metrics is None:
        raise HTTPException(404, tr("not_found"))
    if not active(db, user, definition):
        # A disabled source must not unmount the consuming application.
        raise HTTPException(409, tr("disabled"))
    return definition.metrics


def validate_query(db, user, definitions, query: SourceQuery):
    source = provider(db, user, definitions, query.application_id)
    metric = next((m for m in source.catalogue() if m.id == query.metric_id), None)
    if metric is None or query.aggregation not in metric.aggregations:
        raise HTTPException(422, tr("invalid_query"))
    filters = {f.id: f for f in metric.filters}
    for key, value in query.filters.items():
        spec = filters.get(key)
        valid = spec is not None
        if valid:
            if spec.kind == "number":
                valid = type(value) in (float, int) and spec.minimum <= value <= spec.maximum
            elif spec.kind == "boolean":
                valid = type(value) is bool
            elif spec.kind == "select":
                valid = type(value) is str and value in {o.id for o in spec.options}
            else:
                valid = type(value) is str and bool(value)
        if not valid:
            raise HTTPException(422, tr("invalid_query"))
    return source, metric


def evaluate(db, user, definitions, query: Evaluation):
    source, metric = validate_query(db, user, definitions, query)
    today = utcnow().astimezone(ZoneInfo(query.timezone)).date()
    if metric.temporal == "current" and not query.since <= today <= query.until:
        return MetricValue(
            state="unavailable", observed_at=utcnow(), unit=metric.unit, message=tr("current_only")
        )
    result = source.evaluate(db, user, query)
    result.unit = metric.unit
    return result


def aggregate(values, aggregation, *, count=None):
    if aggregation == "count":
        return float(len(values) if count is None else count)
    if aggregation == "sum":
        return float(sum(values))
    if not values:
        return None
    if aggregation == "change":
        return values[-1] - values[0] if len(values) > 1 else None
    return {
        "average": lambda: sum(values) / len(values),
        "min": lambda: min(values),
        "max": lambda: max(values),
        "latest": lambda: values[-1],
    }[aggregation]()


def bounded(items):
    if len(items) > 20000:
        raise HTTPException(422, tr("limit"))
    return items
