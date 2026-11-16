"""Sport exports owner-scoped facts from immutable training snapshots."""

from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import String, cast, func, or_, select

from life_app.apps.sport import models as m
from life_app.apps.sport.catalogue import catalogue, searchable
from life_app.apps.sport.kinds import kind_definitions
from life_app.apps.sport.messages import tr
from life_app.apps.sport.service import exercise, owned
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

COUNTS = {
    "started",
    "completed",
    "cancelled",
    "training_days",
    "programs",
    "sets",
    "completion_rate",
    "measurements",
}
VALUES = {
    "elapsed_seconds": "s",
    "duration_seconds": "s",
    "reps": "",
    "volume_kg": "kg",
    "distance_m": "m",
    "calories": "kcal",
    "weight_kg": "kg",
    "assistance_kg": "kg",
    "speed": "m/s",
    "score": "%",
}
MEASURES = (
    "weight_kg",
    "body_fat_pct",
    "neck_cm",
    "shoulders_cm",
    "chest_cm",
    "waist_cm",
    "hips_cm",
    "arm_left_cm",
    "arm_right_cm",
    "thigh_left_cm",
    "thigh_right_cm",
    "calf_left_cm",
    "calf_right_cm",
)


def key(value):
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(404, common("not_found")) from None


class SportMetrics:
    def catalogue(self):
        filters = [
            FilterDefinition(id=k, label=tr("integration_" + k))
            for k in ("workout_id", "exercise_id")
        ]
        filters.append(
            FilterDefinition(
                id="kind",
                label=tr("integration_kind"),
                kind="select",
                options=[Option(id=k, label=v.name) for k, v in kind_definitions().items()],
            )
        )
        result = []
        for metric in sorted(COUNTS | VALUES.keys()):
            aggregations = (
                ["count"] if metric in COUNTS else ["sum", "average", "min", "max", "latest"]
            )
            if metric in {"score", "speed", "weight_kg", "assistance_kg"}:
                aggregations = ["average", "min", "max", "latest"]
            if metric == "completion_rate":
                aggregations = ["average"]
            result.append(
                MetricDefinition(
                    id=metric,
                    label=tr("metric_" + metric),
                    description=tr("metric_" + metric + "_description"),
                    unit=VALUES.get(metric, "%" if metric == "completion_rate" else ""),
                    aggregations=aggregations,
                    filters=[]
                    if metric == "measurements"
                    else filters[:1]
                    if metric == "score"
                    else filters,
                )
            )
        for measure in MEASURES:
            result.append(
                MetricDefinition(
                    id="body_" + measure,
                    label=tr("metric_body_" + measure),
                    description=tr("metric_body_description"),
                    unit="kg"
                    if measure == "weight_kg"
                    else "%"
                    if measure == "body_fat_pct"
                    else "cm",
                    aggregations=["latest", "average", "min", "max", "change"],
                )
            )
        return result

    def options(self, db, user, filter_id, q, offset, limit):
        if filter_id == "exercise_id":
            custom = bounded(
                db.scalars(
                    select(m.Exercise)
                    .where(m.Exercise.owner_id == user.id)
                    .order_by(m.Exercise.name, m.Exercise.id)
                    .limit(20001)
                ).all()
            )
            items = [
                Option(id=str(e.id), label=e.name)
                for e in [*catalogue(), *custom]
                if searchable(q) in searchable(e.name) or q == str(e.id)
            ]
            items.sort(key=lambda e: (searchable(e.label), e.id))
            return OptionPage(
                items=items[offset : offset + limit], total=len(items), offset=offset, limit=limit
            )
        if filter_id != "workout_id":
            raise HTTPException(404, common("not_found"))
        query = select(m.Workout).where(
            m.Workout.owner_id == user.id,
            or_(m.Workout.name.ilike("%" + q + "%"), cast(m.Workout.id, String) == q),
        )
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        rows = db.scalars(query.order_by(m.Workout.name, m.Workout.id).offset(offset).limit(limit))
        return OptionPage(
            items=[Option(id=str(w.id), label=w.name) for w in rows],
            total=total,
            offset=offset,
            limit=limit,
        )

    def evaluate(self, db, user, query):
        fs = query.filters
        if "workout_id" in fs:
            owned(db, m.Workout, user, key(fs["workout_id"]))
        if "exercise_id" in fs:
            exercise(db, user, fs["exercise_id"], active=False)
        metric = query.metric_id
        if metric.startswith("body_") or metric == "measurements":
            rows = bounded(
                db.scalars(
                    select(m.Measurement)
                    .where(
                        m.Measurement.owner_id == user.id,
                        m.Measurement.archived_at.is_(None),
                        m.Measurement.measured_on >= query.since,
                        m.Measurement.measured_on <= query.until,
                    )
                    .order_by(m.Measurement.measured_on, m.Measurement.id)
                    .limit(20001)
                ).all()
            )
            values = (
                [r.values[metric[5:]] for r in rows if r.values.get(metric[5:]) is not None]
                if metric != "measurements"
                else [1 for _ in rows]
            )
        else:
            start, end = utc_window(query.since, query.until, query.timezone)
            clock = (
                m.Training.started_at
                if metric in {"started", "completion_rate"}
                else m.Training.finished_at
            )
            sql = select(m.Training).where(
                m.Training.owner_id == user.id, clock >= start, clock < end
            )
            if metric == "cancelled":
                sql = sql.where(m.Training.status == "cancelled")
            elif metric not in {"started", "completion_rate"}:
                sql = sql.where(m.Training.status == "completed")
            if "workout_id" in fs:
                sql = sql.where(m.Training.workout_id == key(fs["workout_id"]))
            rows = bounded(db.scalars(sql.order_by(clock, m.Training.id).limit(20001)).all())
            matched = []
            values = []
            for row in rows:
                indexes = {
                    i
                    for i, e in enumerate(row.entries)
                    if (not fs.get("exercise_id") or e["exercise_id"] == fs["exercise_id"])
                    and (not fs.get("kind") or e["kind"] == fs["kind"])
                }
                if not indexes:
                    continue
                matched.append(row)
                sets = [
                    s
                    for s in row.sets
                    if s["entry_index"] in indexes and not s.get("skipped", False)
                ]
                if metric in {"started", "completed", "cancelled", "completion_rate"}:
                    values.append(1)
                elif metric == "sets":
                    values.extend([1] * len(sets))
                elif metric == "elapsed_seconds":
                    values.append((row.finished_at - row.started_at).total_seconds())
                elif metric == "score":
                    if row.score is not None:
                        values.append(row.score)
                elif metric == "volume_kg":
                    values.extend(
                        s["values"]["weight_kg"] * s["values"]["reps"]
                        for s in sets
                        if "weight_kg" in s["values"] and "reps" in s["values"]
                    )
                elif metric == "speed":
                    distances = sum(
                        s["values"].get("distance_m", 0)
                        for s in sets
                        if "duration_seconds" in s["values"]
                    )
                    seconds = sum(
                        s["values"].get("duration_seconds", 0)
                        for s in sets
                        if "distance_m" in s["values"]
                    )
                    if seconds:
                        values.append(distances / seconds)
                elif metric in VALUES:
                    values.extend(s["values"][metric] for s in sets if metric in s["values"])
            if metric == "training_days":
                values = list(
                    {r.finished_at.astimezone(ZoneInfo(query.timezone)).date() for r in matched}
                )
            if metric == "programs":
                values = list({r.workout_id for r in matched})
            if metric == "completion_rate":
                value = (
                    100 * sum(r.status == "completed" for r in matched) / len(matched)
                    if matched
                    else None
                )
                return MetricValue(
                    value=value,
                    state="ok" if value is not None else "missing",
                    observed_at=utcnow(),
                    sample_count=len(matched),
                )
            if metric == "score" and len({(r.workout_id, r.signature) for r in matched}) > 1:
                return MetricValue(
                    value=None,
                    state="unavailable",
                    observed_at=utcnow(),
                    sample_count=len(matched),
                    message=tr("integration_incomparable"),
                )
        value = aggregate(values, query.aggregation)
        return MetricValue(
            value=value,
            state="missing" if value is None else "ok",
            observed_at=utcnow(),
            sample_count=len(values),
        )
