from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import Integer, func, select

from life_app.apps.okr import models as m
from life_app.apps.okr import schemas as s
from life_app.apps.okr.messages import tr
from life_app.apps.okr.progression import provider
from life_app.core.database import utcnow
from life_app.platform.progression.service import record

HORIZONS = ("ten_year", "three_year", "annual", "quarterly")


def owned(db, user, id):
    item = db.scalar(
        select(m.Objective).where(m.Objective.id == id, m.Objective.owner_id == user.id)
    )
    if item is None:
        raise HTTPException(404, tr("not_found"))
    return item


def history(db, user, id, offset, limit):
    owned(db, user, id)
    return db.scalars(
        select(m.Event)
        .where(m.Event.objective_id == id, m.Event.owner_id == user.id)
        .order_by(
            m.Event.snapshot["version"].astext.cast(Integer).desc(),
            m.Event.occurred_at.desc(),
            m.Event.id,
        )
        .offset(offset)
        .limit(limit)
    ).all()


def settings(db, user):
    value = db.get(m.OkrSettings, user.id)
    timezone = value.timezone if value else "Europe/Paris"
    today = utcnow().astimezone(ZoneInfo(timezone)).date()
    return s.SettingsOutput(
        timezone=timezone,
        version=value.version if value else 0,
        today=today,
        current_quarter=s.quarter(today),
    )


def save_settings(db, user, payload):
    previous = settings(db, user)
    if payload.expected_version != previous.version:
        raise HTTPException(409, tr("conflict"))
    item = db.get(m.OkrSettings, user.id)
    if item is None:
        item = m.OkrSettings(owner_id=user.id)
        db.add(item)
    item.timezone = payload.timezone
    item.version = previous.version + 1
    db.flush()
    return settings(db, user)


def output(item):
    values = {key: getattr(item, key) for key in s.ObjectiveInput.model_fields}
    results = [s.KeyResult.model_validate(kr) for kr in item.key_results]
    return s.ObjectiveOutput(
        **values,
        id=item.id,
        version=item.version,
        status=item.status,
        position=item.position,
        planned_quarter=s.quarter(item.start_date) if item.start_date else None,
        completed_quarter=item.completed_quarter,
        progress=round(100 * sum(kr.progress for kr in results) / len(results), 2)
        if results
        else (100 if item.status == "done" else 0),
        created_at=item.created_at,
        updated_at=item.updated_at,
        completed_at=item.completed_at,
        archived_at=item.archived_at,
    )


def objectives(db, user, archived=False):
    return db.scalars(
        select(m.Objective)
        .where(
            m.Objective.owner_id == user.id,
            m.Objective.archived_at.is_not(None) if archived else m.Objective.archived_at.is_(None),
        )
        .order_by(m.Objective.position, m.Objective.created_at, m.Objective.id)
    ).all()


def check(item, version, *, editable=True):
    if item.version != version:
        raise HTTPException(409, tr("conflict"))
    if editable and (item.archived_at or item.status == "done"):
        raise HTTPException(409, tr("read_only"))


def validate_parent(db, user, payload, item=None):
    if payload.parent_id:
        if item is not None and payload.parent_id == item.id:
            raise HTTPException(422, tr("parent"))
        parent = owned(db, user, payload.parent_id)
        rank = HORIZONS.index(payload.horizon)
        if not rank or parent.horizon != HORIZONS[rank - 1] or parent.domain != payload.domain:
            raise HTTPException(422, tr("parent"))
        if parent.archived_at and (item is None or item.parent_id != parent.id):
            raise HTTPException(422, tr("parent_archived"))
    if item and (payload.horizon != item.horizon or payload.domain != item.domain):
        if db.scalar(select(m.Objective.id).where(m.Objective.parent_id == item.id).limit(1)):
            raise HTTPException(409, tr("children"))


def event(db, user, item, kind, detail=None):
    occurred = item.completed_at if kind == "completed" else utcnow()
    row = m.Event(
        owner_id=user.id,
        objective_id=item.id,
        kind=kind,
        occurred_at=occurred,
        quarter=item.completed_quarter
        if kind == "completed"
        else s.quarter(occurred.astimezone(ZoneInfo(settings(db, user).timezone)).date()),
        snapshot=output(item).model_dump(mode="json"),
        detail=detail or {},
    )
    db.add(row)
    db.flush()
    activity = provider.activity(row)
    if activity:
        record(db, user, "okr", provider, activity)
    return row


def reached(db, user, item):
    previous = set(
        db.scalars(
            select(m.Event.detail["key_result_id"].astext).where(
                m.Event.objective_id == item.id, m.Event.kind == "key_result_reached"
            )
        )
    )
    for kr in map(s.KeyResult.model_validate, item.key_results):
        if kr.progress == 1 and str(kr.id) not in previous:
            event(db, user, item, "key_result_reached", {"key_result_id": str(kr.id)})


def assign(item, payload):
    for key, value in payload.model_dump(exclude={"expected_version", "key_results"}).items():
        setattr(item, key, value)
    item.key_results = [kr.model_dump(mode="json") for kr in payload.key_results]


def next_position(db, user, horizon, status="backlog"):
    maximum = db.scalar(
        select(func.max(m.Objective.position)).where(
            m.Objective.owner_id == user.id,
            m.Objective.horizon == horizon,
            m.Objective.status == status,
            m.Objective.archived_at.is_(None),
        )
    )
    return (maximum if maximum is not None else -1) + 1


def create(db, user, payload):
    if (
        db.scalar(
            select(func.count()).select_from(m.Objective).where(m.Objective.owner_id == user.id)
        )
        >= 5000
    ):
        raise HTTPException(422, tr("limit"))
    validate_parent(db, user, payload)
    item = m.Objective(owner_id=user.id, position=next_position(db, user, payload.horizon))
    assign(item, payload)
    db.add(item)
    db.flush()
    event(db, user, item, "created")
    reached(db, user, item)
    return item


def update(db, user, item, payload):
    check(item, payload.expected_version)
    validate_parent(db, user, payload, item)
    if item.horizon != payload.horizon:
        item.position = next_position(db, user, payload.horizon, item.status)
    assign(item, payload)
    item.version += 1
    item.updated_at = utcnow()
    db.flush()
    event(db, user, item, "updated")
    reached(db, user, item)
    return item


def check_in(db, user, item, kr_id: UUID, payload):
    check(item, payload.expected_version)
    results = [s.KeyResult.model_validate(k) for k in item.key_results]
    kr = next((k for k in results if k.id == kr_id), None)
    if kr is None:
        raise HTTPException(404, tr("not_found"))
    kr.current = payload.value
    item.key_results = [k.model_dump(mode="json") for k in results]
    item.version += 1
    item.updated_at = utcnow()
    db.flush()
    event(db, user, item, "check_in", {"key_result_id": str(kr_id), "note": payload.note})
    reached(db, user, item)
    return item


def move(db, user, item, payload):
    check(item, payload.expected_version, editable=False)
    if item.archived_at:
        raise HTTPException(409, tr("read_only"))
    old_status = item.status
    timezone = settings(db, user).timezone
    if payload.status == "done" and old_status != "done":
        if any(s.KeyResult.model_validate(k).progress < 1 for k in item.key_results):
            raise HTTPException(422, tr("unfinished"))
        item.completed_at = utcnow()
        item.completed_quarter = s.quarter(item.completed_at.astimezone(ZoneInfo(timezone)).date())
    elif old_status == "done" and payload.status != "done":
        item.completed_at = None
        item.completed_quarter = None
    item.status = payload.status
    item.version += 1
    item.updated_at = utcnow()
    # Owner lock serializes the entire column; every affected version changes.
    column = [
        o
        for o in objectives(db, user)
        if o.id != item.id and o.status == item.status and o.horizon == item.horizon
    ]
    column.insert(min(payload.position, len(column)), item)
    for index, other in enumerate(column):
        if other.position != index:
            other.position = index
            if other.id != item.id:
                other.version += 1
                other.updated_at = item.updated_at
    db.flush()
    kind = (
        "completed"
        if old_status != "done" and item.status == "done"
        else "reopened"
        if old_status == "done" and item.status != "done"
        else "moved"
    )
    event(db, user, item, kind)
    return item


def archive(db, user, item, payload):
    check(item, payload.expected_version, editable=False)
    if bool(item.archived_at) == payload.archived:
        return item
    item.archived_at = utcnow() if payload.archived else None
    item.version += 1
    item.updated_at = utcnow()
    db.flush()
    event(db, user, item, "archived" if payload.archived else "restored")
    return item


def achievements(db, user, quarter, offset, limit):
    quarter = quarter or settings(db, user).current_quarter
    base = select(m.Event).where(m.Event.owner_id == user.id, m.Event.kind == "completed")
    quarters = list(
        db.scalars(
            select(m.Event.quarter)
            .where(m.Event.owner_id == user.id, m.Event.kind == "completed")
            .distinct()
            .order_by(m.Event.quarter.desc())
        )
    )
    query = base.where(m.Event.quarter == quarter)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = list(
        db.scalars(
            query.order_by(m.Event.occurred_at.desc(), m.Event.id).offset(offset).limit(limit)
        )
    )
    reopened = dict(
        db.execute(
            select(m.Event.objective_id, func.max(m.Event.snapshot["version"].astext.cast(Integer)))
            .where(
                m.Event.owner_id == user.id,
                m.Event.kind == "reopened",
                m.Event.objective_id.in_([r.objective_id for r in rows]),
            )
            .group_by(m.Event.objective_id)
        ).all()
    )
    return s.AchievementPage(
        quarter=quarter,
        quarters=quarters,
        total=total,
        items=[
            s.Achievement(
                **s.EventOutput.model_validate(row).model_dump(),
                reopened=row.objective_id in reopened
                and reopened[row.objective_id] > row.snapshot["version"],
            )
            for row in rows
        ],
    )
