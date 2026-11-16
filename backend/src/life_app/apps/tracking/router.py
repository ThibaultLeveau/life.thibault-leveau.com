from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from life_app.apps.tracking import models as m
from life_app.apps.tracking import schemas as s
from life_app.apps.tracking import service as svc
from life_app.apps.tracking.messages import tr
from life_app.core.database import Database
from life_app.platform.auth.service import CurrentUser

router = APIRouter(prefix="/tracking", tags=["Tracking"])


@router.get("/trackers", response_model=list[s.TrackerOutput])
def trackers(user: CurrentUser, db: Database, archived: bool = False):
    return [svc.output(i) for i in svc.trackers(db, user, archived)]


@router.post("/trackers", response_model=s.TrackerOutput, status_code=201)
def create(payload: s.TrackerInput, request: Request, user: CurrentUser, db: Database):
    item = svc.create_tracker(db, user, request.app.state.applications, payload)
    db.flush()
    result = svc.output(item)
    db.commit()
    return result


@router.put("/trackers/order", response_model=list[s.TrackerOutput])
def order(payload: s.Order, user: CurrentUser, db: Database):
    from fastapi import HTTPException

    items = svc.trackers(db, user)
    if len(set(payload.ids)) != len(payload.ids) or set(payload.ids) != {i.id for i in items}:
        raise HTTPException(422, tr("invalid"))
    positions = {id: i for i, id in enumerate(payload.ids)}
    for item in items:
        item.position = positions[item.id]
    db.commit()
    return [svc.output(i) for i in sorted(items, key=lambda i: i.position)]


@router.get("/trackers/{id}", response_model=s.TrackerOutput)
def tracker(id: UUID, user: CurrentUser, db: Database):
    return svc.output(svc.owned(db, user, id))


@router.put("/trackers/{id}", response_model=s.TrackerOutput)
def update(id: UUID, payload: s.TrackerUpdate, request: Request, user: CurrentUser, db: Database):
    item = svc.update_tracker(
        db, user, request.app.state.applications, svc.owned(db, user, id), payload
    )
    db.flush()
    result = svc.output(item)
    db.commit()
    return result


@router.put("/trackers/{id}/archive", response_model=s.TrackerOutput)
def archive(id: UUID, payload: s.Archive, user: CurrentUser, db: Database):
    item = svc.archive(db, user, svc.owned(db, user, id), payload)
    db.flush()
    result = svc.output(item)
    db.commit()
    return result


@router.get("/settings", response_model=s.Settings)
def settings(user: CurrentUser, db: Database):
    return svc.settings(db, user)


@router.put("/settings", response_model=s.Settings)
def save_settings(payload: s.Settings, user: CurrentUser, db: Database):
    item = db.get(m.TrackingSettings, user.id)
    if item is None:
        item = m.TrackingSettings(owner_id=user.id)
        db.add(item)
    item.timezone = payload.timezone
    db.commit()
    return payload


@router.get("/current", response_model=list[s.Occurrence])
def current(
    user: CurrentUser, db: Database, day: date | None = None, include_archived: bool = False
):
    return svc.current(db, user, day, include_archived)


@router.get("/calendar", response_model=s.Calendar)
def calendar(
    user: CurrentUser, db: Database, since: date, until: date, tracker_id: UUID | None = None
):
    return svc.calendar(db, user, since, until, tracker_id)


@router.get("/statistics", response_model=s.Statistics)
def statistics(
    user: CurrentUser, db: Database, since: date, until: date, tracker_id: UUID | None = None
):
    return svc.statistics(db, user, since, until, tracker_id)


@router.get("/achievements", response_model=s.Achievement)
def achievements(user: CurrentUser, db: Database):
    return svc.achievements(db, user)


@router.get("/trackers/{id}/entries/{day}", response_model=s.Occurrence)
def entry(id: UUID, day: date, user: CurrentUser, db: Database):
    return svc.get_occurrence(db, user, svc.owned(db, user, id), day)[0]


@router.post("/trackers/{id}/entries/{day}/preview", response_model=s.Occurrence)
def preview(id: UUID, day: date, request: Request, user: CurrentUser, db: Database):
    """Sources recalculées sans modifier l’instantané de la saisie enregistrée."""
    return svc.preview(db, user, request.app.state.applications, svc.owned(db, user, id), day)


@router.put("/trackers/{id}/entries/{day}", response_model=s.EntryOutput)
def write(
    id: UUID, day: date, payload: s.EntryWrite, request: Request, user: CurrentUser, db: Database
):
    """Valeurs partielles ; sources calculées au serveur ; expected_version=0 à la création."""
    result = svc.write_entry(
        db, user, request.app.state.applications, svc.owned(db, user, id), day, payload
    )
    db.commit()
    return result


@router.get("/trackers/{id}/entries/{day}/history", response_model=list[s.EntryRevision])
def history(
    id: UUID,
    day: date,
    user: CurrentUser,
    db: Database,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    _, entry = svc.get_occurrence(db, user, svc.owned(db, user, id), day)
    if entry is None:
        return []
    return db.scalars(
        select(m.EntryRevision)
        .where(m.EntryRevision.entry_id == entry.id)
        .order_by(m.EntryRevision.version.desc())
        .offset(offset)
        .limit(limit)
    ).all()
