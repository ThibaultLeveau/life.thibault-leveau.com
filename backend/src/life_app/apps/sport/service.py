"""Owner-scoped business rules. The common CurrentUser lock serializes all mutations."""

import hashlib
import json
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select

from life_app.apps.sport import models as m
from life_app.apps.sport import schemas as s
from life_app.apps.sport.catalogue import BY_ID, CATALOGUE, searchable
from life_app.apps.sport.kinds import KINDS, performance, validate_values
from life_app.core.database import utcnow


def owned(db, model, owner, id):
    item = db.scalar(select(model).where(model.id == id, model.owner_id == owner.id))
    if item is None:
        raise HTTPException(404, "Élément introuvable.")
    return item


def version(item, expected):
    if item.version != expected:
        raise HTTPException(409, "Cet élément a changé. Rechargez-le avant de réessayer.")


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
        return BY_ID[id]
    try:
        key = UUID(id)
    except ValueError as error:
        raise HTTPException(404, "Exercice introuvable.") from error
    result = exercise_output(owned(db, m.Exercise, user, key))
    if active and result.archived_at:
        raise HTTPException(409, "Restaurez cet exercice avant de l’utiliser.")
    return result


def exercises(db, user, query, kind, muscle, equipment, archived, offset, limit):
    personal = db.scalars(
        select(m.Exercise).where(
            m.Exercise.owner_id == user.id,
            m.Exercise.archived_at.is_not(None) if archived else m.Exercise.archived_at.is_(None),
        )
    ).all()
    items = ([] if archived else list(CATALOGUE)) + [exercise_output(e) for e in personal]
    tokens = searchable(query).split()
    items = [
        e
        for e in items
        if (not kind or e.kind == kind)
        and (not muscle or e.muscle_group == muscle)
        and (not equipment or e.equipment == equipment)
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
    return s.TrainingOutput(
        **{key: getattr(item, key) for key in s.TrainingOutput.model_fields if key != "server_now"},
        server_now=utcnow(),
    )


def start(db, user, payload):
    workout = owned(db, m.Workout, user, payload.workout_id)
    version(workout, payload.expected_version)
    if workout.archived_at:
        raise HTTPException(409, "Restaurez cette séance avant de la lancer.")
    active = db.scalar(
        select(m.Training.id).where(m.Training.owner_id == user.id, m.Training.status == "active")
    )
    if active:
        raise HTTPException(409, "Un entraînement est déjà en cours. Reprenez-le ou abandonnez-le.")
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
    item = m.Training(
        owner_id=user.id,
        workout_id=workout.id,
        name=workout.name,
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
        raise HTTPException(409, "Cet entraînement est terminé ; son historique est conservé.")
    return item


def set_position(item, entry, index):
    if not 0 <= entry < len(item.entries) or not 0 <= index < item.entries[entry]["sets"]:
        raise HTTPException(404, "Série introuvable.")


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
    if payload.outcome == "completed":
        if len(item.sets) != sum(e["sets"] for e in item.entries):
            raise HTTPException(409, "Validez toutes les séries avant de terminer la séance.")
        item.metrics = metrics(item)
        baseline = db.scalar(
            select(m.Training)
            .where(
                m.Training.owner_id == user.id,
                m.Training.workout_id == item.workout_id,
                m.Training.signature == item.signature,
                m.Training.status == "completed",
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
        )
    item.status = payload.outcome
    item.finished_at = utcnow()
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
        raise HTTPException(409, "Une mesure existe déjà à cette date. Modifiez-la ou archivez-la.")


def save_measurement(db, user, payload, item=None):
    check_measurement_day(db, user, payload.measured_on, item.id if item else None)
    if item:
        version(item, payload.expected_version)
        if item.archived_at:
            raise HTTPException(409, "Restaurez cette mesure avant de la modifier.")
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
        raise HTTPException(422, "Choisissez une période ordonnée de dix ans maximum.")
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
        total_sets=sum(len(t.sets) for t in trainings),
        total_volume_kg=sum(v["volume_kg"] for t in trainings for v in t.metrics),
        total_distance_m=sum(v["distance_m"] for t in trainings for v in t.metrics),
        sessions=[training_output(t) for t in trainings],
        measurements=[measurement_output(m) for m in measures],
        since=since,
        until=until,
    )
