"""Owner-scoped business rules. The common CurrentUser lock serializes all mutations."""

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select

from life_app.apps.sport import models as m
from life_app.apps.sport import schemas as s
from life_app.apps.sport.catalogue import (
    BY_ID,
    catalogue,
    default_exercise,
    localized_snapshot,
    searchable,
)
from life_app.apps.sport.kinds import KINDS, performance, validate_values
from life_app.apps.sport.messages import tr
from life_app.core.database import utcnow


def owned(db, model, owner, id):
    item = db.scalar(select(model).where(model.id == id, model.owner_id == owner.id))
    if item is None:
        raise HTTPException(404, tr("item_not_found"))
    return item


def version(item, expected):
    if item.version != expected:
        raise HTTPException(409, tr("this_item_has_changed_reload_it_before_trying_again"))


def touch(item):
    item.version += 1
    if hasattr(item, "updated_at"):
        item.updated_at = utcnow()


def exercise_output(item):
    return s.ExerciseOutput(
        id=str(item.id),
        name=item.name,
        kind=item.kind,
        muscle_group=item.muscle_group,
        equipment=item.equipment,
        notes=item.notes,
        version=item.version,
        archived_at=item.archived_at,
    )


def exercise(db, user, id, *, active=True):
    if id in BY_ID:
        return default_exercise(id)
    try:
        key = UUID(id)
    except ValueError as error:
        raise HTTPException(404, tr("exercise_not_found")) from error
    result = exercise_output(owned(db, m.Exercise, user, key))
    if active and result.archived_at:
        raise HTTPException(409, tr("restore_this_exercise_before_using_it"))
    return result


def exercises(db, user, query, kind, muscle, equipment, archived, offset, limit):
    personal = db.scalars(
        select(m.Exercise).where(
            m.Exercise.owner_id == user.id,
            m.Exercise.archived_at.is_not(None) if archived else m.Exercise.archived_at.is_(None),
        )
    ).all()
    items = ([] if archived else list(catalogue())) + [exercise_output(e) for e in personal]
    tokens = searchable(query).split()
    items = [
        e
        for e in items
        if (not kind or e.kind == kind)
        and (
            not muscle
            or muscle in {e.muscle_id, e.muscle_group}
            or e.builtin
            and BY_ID[e.id].muscle_group == muscle
        )
        and (
            not equipment
            or equipment in {e.equipment_id, e.equipment}
            or e.builtin
            and BY_ID[e.id].equipment == equipment
        )
        and all(
            t in searchable(" ".join([e.name, e.muscle_group, e.equipment, *e.aliases]))
            for t in tokens
        )
    ]
    items.sort(key=lambda e: (searchable(e.name), e.id))
    return s.ExercisePage(
        items=items[offset : offset + limit], total=len(items), offset=offset, limit=limit
    )


def snapshot(db, user, entries):
    result = []
    for entry in entries:
        ex = exercise(db, user, entry.exercise_id)
        values = validate_values(ex.kind, entry.target)
        result.append(
            s.SnapshotEntry(
                **entry.model_dump(exclude={"target"}), target=values, name=ex.name, kind=ex.kind
            ).model_dump(mode="json")
        )
    return result


def settings(db, user):
    return db.get(m.SportSettings, user.id) or s.Settings()


def training_output(item):
    output = s.TrainingOutput(
        **{key: getattr(item, key) for key in s.TrainingOutput.model_fields if key != "server_now"},
        server_now=utcnow(),
    )
    output.entries = [
        s.TrainingEntry(**localized_snapshot(entry.model_dump())) for entry in output.entries
    ]
    output.metrics = [
        s.Metric(
            **{**localized_snapshot(entry.model_dump()), "unit": tr(f"kind_{entry.kind}_unit")}
        )
        for entry in output.metrics
    ]
    return output


def workout_output(item):
    output = s.WorkoutOutput.model_validate(item)
    output.entries = [
        s.SnapshotEntry(**localized_snapshot(entry.model_dump())) for entry in output.entries
    ]
    return output


def entry_keys(entries):
    """Match reordered exercises; repeated occurrences remain separate."""
    occurrences = {}
    for entry in entries:
        identity = (entry["exercise_id"], entry["kind"])
        occurrence = occurrences.get(identity, 0)
        occurrences[identity] = occurrence + 1
        yield (*identity, occurrence)


def suggest_previous_values(db, user, workout, entries):
    suggestions = {
        key: [None] * entry["sets"] for key, entry in zip(entry_keys(entries), entries, strict=True)
    }
    remaining = sum(len(values) for values in suggestions.values())
    history = db.scalars(
        select(m.Training)
        .where(
            m.Training.owner_id == user.id,
            m.Training.workout_id == workout.id,
            m.Training.status != "active",
        )
        .order_by(m.Training.finished_at.desc(), m.Training.id)
    ).yield_per(50)
    for previous in history:
        keys = list(entry_keys(previous.entries))
        for record in previous.sets:
            if record.get("skipped", False):
                continue
            values = suggestions.get(keys[record["entry_index"]])
            index = record["set_index"]
            if values is not None and index < len(values) and values[index] is None:
                values[index] = dict(record["values"])
                remaining -= 1
        if not remaining:
            break
    for entry, values in zip(entries, suggestions.values(), strict=True):
        entry["suggested_values"] = values


def start(db, user, payload):
    workout = owned(db, m.Workout, user, payload.workout_id)
    version(workout, payload.expected_version)
    if workout.archived_at:
        raise HTTPException(409, tr("restore_this_program_before_starting_a_training_session"))
    active = db.scalar(
        select(m.Training.id).where(m.Training.owner_id == user.id, m.Training.status == "active")
    )
    if active:
        raise HTTPException(
            409, tr("a_training_session_is_already_in_progress_resume_or_cancel_it")
        )
    # Re-resolve active exercises at start; historical snapshots remain independent afterwards.
    entries = snapshot(
        db,
        user,
        [
            s.TemplateEntry.model_validate(
                {k: value for k, value in e.items() if k in s.TemplateEntry.model_fields}
            )
            for e in workout.entries
        ],
    )
    signature = hashlib.sha256(
        json.dumps(
            [(e["exercise_id"], e["kind"], e["sets"]) for e in entries], separators=(",", ":")
        ).encode()
    ).hexdigest()
    suggest_previous_values(db, user, workout, entries)
    item = m.Training(
        owner_id=user.id,
        workout_id=workout.id,
        name=workout.name,
        competition_date=workout.competition_date,
        entries=entries,
        signature=signature,
    )
    db.add(item)
    db.flush()
    return item


def active_session(db, user, id, expected):
    item = owned(db, m.Training, user, id)
    version(item, expected)
    if item.status != "active":
        raise HTTPException(409, tr("this_training_session_has_ended_its_history_is_preserved"))
    return item


def set_position(item, entry, index):
    if not 0 <= entry < len(item.entries) or not 0 <= index < item.entries[entry]["sets"]:
        raise HTTPException(404, tr("set_not_found"))


def save_set(db, user, id, entry, index, payload):
    item = active_session(db, user, id, payload.expected_version)
    set_position(item, entry, index)
    values = validate_values(item.entries[entry]["kind"], payload.values, complete=True)
    previous = next(
        (v for v in item.sets if (v["entry_index"], v["set_index"]) == (entry, index)), None
    )
    current = utcnow()
    record = dict(
        entry_index=entry,
        set_index=index,
        values=values,
        completed_at=previous["completed_at"] if previous else current.isoformat(),
    )
    item.sets = sorted(
        [v for v in item.sets if (v["entry_index"], v["set_index"]) != (entry, index)] + [record],
        key=lambda v: (v["entry_index"], v["set_index"]),
    )
    # Editing an already validated set does not restart recovery or change its completion date.
    if not previous:
        item.rest_until = current + timedelta(seconds=settings(db, user).rest_seconds)
    touch(item)
    return item


def remove_set(db, user, id, entry, index, payload):
    item = active_session(db, user, id, payload.expected_version)
    set_position(item, entry, index)
    item.sets = [v for v in item.sets if (v["entry_index"], v["set_index"]) != (entry, index)]
    item.rest_until = None
    touch(item)
    return item


def metrics(item):
    result = []
    for index, entry in enumerate(item.entries):
        values = [v["values"] for v in item.sets if v["entry_index"] == index]
        result.append(
            s.Metric(
                exercise_id=entry["exercise_id"],
                name=entry["name"],
                kind=entry["kind"],
                value=performance(entry["kind"], values),
                unit=KINDS[entry["kind"]].metric_unit,
                volume_kg=sum(v.get("weight_kg", 0) * v.get("reps", 0) for v in values),
                reps=sum(v.get("reps", 0) for v in values),
                distance_m=sum(v.get("distance_m", 0) for v in values),
                duration_seconds=sum(v.get("duration_seconds", 0) for v in values),
            ).model_dump()
        )
    return result


def finish(db, user, id, payload):
    item = active_session(db, user, id, payload.expected_version)
    finished_at = utcnow()
    if payload.outcome == "completed":
        recorded = {(v["entry_index"], v["set_index"]): v for v in item.sets}
        item.sets = [
            recorded.get((i, j))
            or dict(
                entry_index=i,
                set_index=j,
                values={field.key: 0 for field in KINDS[entry["kind"]].fields},
                completed_at=finished_at.isoformat(),
                skipped=True,
            )
            for i, entry in enumerate(item.entries)
            for j in range(entry["sets"])
        ]
        item.metrics = metrics(item)
        baseline = db.scalar(
            select(m.Training)
            .where(
                m.Training.owner_id == user.id,
                m.Training.workout_id == item.workout_id,
                m.Training.signature == item.signature,
                m.Training.status == "completed",
                # The earliest scored session has positive metrics for every
                # exercise, so it provides valid denominators for future scores.
                m.Training.score.is_not(None),
            )
            .order_by(m.Training.finished_at, m.Training.id)
            .limit(1)
        )
        item.baseline_id = baseline.id if baseline else None
        item.score = (
            round(
                100
                * sum(
                    current["value"] / reference["value"]
                    for current, reference in zip(item.metrics, baseline.metrics, strict=True)
                )
                / len(item.metrics),
                2,
            )
            if baseline
            else 100.0
            if all(metric["value"] > 0 for metric in item.metrics)
            else None
        )
    item.status = payload.outcome
    item.finished_at = finished_at
    item.rest_until = None
    item.notes = payload.notes
    touch(item)
    return item


def measurement_output(item):
    return s.MeasurementOutput(
        id=item.id,
        measured_on=item.measured_on,
        notes=item.notes,
        version=item.version,
        created_at=item.created_at,
        updated_at=item.updated_at,
        archived_at=item.archived_at,
        **item.values,
    )


def check_measurement_day(db, user, day, except_id=None):
    query = select(m.Measurement.id).where(
        m.Measurement.owner_id == user.id,
        m.Measurement.measured_on == day,
        m.Measurement.archived_at.is_(None),
    )
    if except_id:
        query = query.where(m.Measurement.id != except_id)
    if db.scalar(query):
        raise HTTPException(
            409, tr("a_measurement_already_exists_for_this_date_edit_or_archive_it")
        )


def save_measurement(db, user, payload, item=None):
    check_measurement_day(db, user, payload.measured_on, item.id if item else None)
    if item:
        version(item, payload.expected_version)
        if item.archived_at:
            raise HTTPException(409, tr("restore_this_measurement_before_editing_it"))
        touch(item)
    else:
        item = m.Measurement(owner_id=user.id)
        db.add(item)
    item.measured_on = payload.measured_on
    item.notes = payload.notes
    item.values = payload.model_dump(
        exclude={"measured_on", "notes", "expected_version"}, exclude_none=True
    )
    db.flush()
    return item


def archive(db, user, model, id, payload):
    item = owned(db, model, user, id)
    version(item, payload.expected_version)
    if bool(item.archived_at) == payload.archived:
        return item
    if model == m.Measurement and not payload.archived:
        check_measurement_day(db, user, item.measured_on, item.id)
    item.archived_at = utcnow() if payload.archived else None
    touch(item)
    return item


def history(db, user, offset, limit):
    query = select(m.Training).where(m.Training.owner_id == user.id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(
        query.order_by(m.Training.started_at.desc(), m.Training.id).offset(offset).limit(limit)
    )
    return s.SessionPage(
        items=[training_output(i) for i in items], total=total, offset=offset, limit=limit
    )


def statistics(db, user, since, until):
    if since > until or (until - since).days > 3660 or until == date.max:
        raise HTTPException(422, tr("choose_a_date_range_in_chronological_order_up_to_ten_years"))
    trainings = db.scalars(
        select(m.Training)
        .where(
            m.Training.owner_id == user.id,
            m.Training.status == "completed",
            m.Training.started_at >= datetime.combine(since, time.min, UTC),
            m.Training.started_at < datetime.combine(until + timedelta(days=1), time.min, UTC),
        )
        .order_by(m.Training.started_at, m.Training.id)
    ).all()
    measures = db.scalars(
        select(m.Measurement)
        .where(
            m.Measurement.owner_id == user.id,
            m.Measurement.archived_at.is_(None),
            m.Measurement.measured_on >= since,
            m.Measurement.measured_on <= until,
        )
        .order_by(m.Measurement.measured_on)
    ).all()
    return s.Statistics(
        completed_sessions=len(trainings),
        total_sets=sum(not s.get("skipped", False) for t in trainings for s in t.sets),
        total_volume_kg=sum(v["volume_kg"] for t in trainings for v in t.metrics),
        total_distance_m=sum(v["distance_m"] for t in trainings for v in t.metrics),
        sessions=[training_output(t) for t in trainings],
        measurements=[measurement_output(m) for m in measures],
        since=since,
        until=until,
    )
