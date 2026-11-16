from typing import Literal

from fastapi import APIRouter, Query, Request

from life_app.core.database import Database
from life_app.platform.auth.service import CurrentUser
from life_app.platform.integrations.service import active
from life_app.platform.progression import schemas as s
from life_app.platform.progression import service as svc

router = APIRouter(prefix="/progression", tags=["Progression"])


@router.get("/settings", response_model=s.SettingsOutput)
def settings(user: CurrentUser, db: Database):
    return svc.settings(db, user)


@router.put("/settings", response_model=s.SettingsOutput)
def save_settings(payload: s.SettingsWrite, request: Request, user: CurrentUser, db: Database):
    result = svc.save_settings(db, user, request.app.state.applications, payload)
    db.commit()
    return result


@router.get("", response_model=list[s.Summary])
def summaries(request: Request, user: CurrentUser, db: Database):
    return [
        svc.summary(db, user, app)
        for app in request.app.state.applications
        if app.progression is not None and active(db, user, app)
    ]


@router.get("/{application_id}", response_model=s.Summary)
def summary(application_id: str, request: Request, user: CurrentUser, db: Database):
    return svc.summary(
        db, user, svc.definition(db, user, request.app.state.applications, application_id)
    )


@router.get("/{application_id}/quests", response_model=s.QuestPage)
def quests(
    application_id: str,
    request: Request,
    user: CurrentUser,
    db: Database,
    state: Literal["all", "available", "earned"] = "all",
    category: str = Query("", max_length=40),
    q: str = Query("", max_length=120),
    offset: int = Query(0, ge=0, le=100000),
    limit: int = Query(60, ge=1, le=100),
):
    app = svc.definition(db, user, request.app.state.applications, application_id)
    items = [
        quest
        for quest in svc.quests(db, user, app)
        if (state == "all" or bool(quest.earned_at) == (state == "earned"))
        and (not category or quest.category == category)
        and (not q or q.casefold() in (quest.name + " " + quest.description).casefold())
    ]
    items.sort(key=lambda quest: (bool(quest.earned_at), -quest.ratio, quest.target, quest.id))
    return s.QuestPage(
        items=items[offset : offset + limit], total=len(items), offset=offset, limit=limit
    )


@router.get("/{application_id}/history", response_model=s.History)
def history(
    application_id: str,
    request: Request,
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0, le=100000),
    limit: int = Query(20, ge=1, le=100),
):
    app = svc.definition(db, user, request.app.state.applications, application_id)
    return svc.history(db, user, app, offset, limit)
