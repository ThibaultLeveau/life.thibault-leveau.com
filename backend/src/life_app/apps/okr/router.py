from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import select

from life_app.apps.okr import models as m
from life_app.apps.okr import schemas as s
from life_app.apps.okr import service as svc
from life_app.core.database import Database
from life_app.platform.auth.service import CurrentUser

router = APIRouter(prefix="/okr", tags=["OKR"])


def saved(db, item):
    result = svc.output(item)
    db.commit()
    return result


@router.get("/objectives", response_model=list[s.ObjectiveOutput])
def objectives(user: CurrentUser, db: Database, archived: bool = False):
    return [svc.output(item) for item in svc.objectives(db, user, archived)]


@router.post("/objectives", response_model=s.ObjectiveOutput, status_code=201)
def create(payload: s.ObjectiveInput, user: CurrentUser, db: Database):
    return saved(db, svc.create(db, user, payload))


@router.get("/objectives/{id}", response_model=s.ObjectiveOutput)
def objective(id: UUID, user: CurrentUser, db: Database):
    return svc.output(svc.owned(db, user, id))


@router.put("/objectives/{id}", response_model=s.ObjectiveOutput)
def update(id: UUID, payload: s.ObjectiveUpdate, user: CurrentUser, db: Database):
    return saved(db, svc.update(db, user, svc.owned(db, user, id), payload))


@router.put("/objectives/{id}/move", response_model=s.ObjectiveOutput)
def move(id: UUID, payload: s.Move, user: CurrentUser, db: Database):
    return saved(db, svc.move(db, user, svc.owned(db, user, id), payload))


@router.put("/objectives/{id}/archive", response_model=s.ObjectiveOutput)
def archive(id: UUID, payload: s.Archive, user: CurrentUser, db: Database):
    return saved(db, svc.archive(db, user, svc.owned(db, user, id), payload))


@router.put("/objectives/{id}/key-results/{key_result_id}", response_model=s.ObjectiveOutput)
def check_in(id: UUID, key_result_id: UUID, payload: s.CheckIn, user: CurrentUser, db: Database):
    return saved(db, svc.check_in(db, user, svc.owned(db, user, id), key_result_id, payload))


@router.get("/objectives/{id}/history", response_model=list[s.EventOutput])
def history(
    id: UUID,
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    svc.owned(db, user, id)
    return db.scalars(
        select(m.Event)
        .where(m.Event.objective_id == id, m.Event.owner_id == user.id)
        .order_by(m.Event.occurred_at.desc(), m.Event.id)
        .offset(offset)
        .limit(limit)
    ).all()


@router.get("/achievements", response_model=s.AchievementPage)
def achievements(
    user: CurrentUser,
    db: Database,
    quarter: s.Quarter | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    return svc.achievements(db, user, quarter, offset, limit)


@router.get("/settings", response_model=s.SettingsOutput)
def settings(user: CurrentUser, db: Database):
    return svc.settings(db, user)


@router.put("/settings", response_model=s.SettingsOutput)
def save_settings(payload: s.SettingsUpdate, user: CurrentUser, db: Database):
    result = svc.save_settings(db, user, payload)
    db.commit()
    return result
