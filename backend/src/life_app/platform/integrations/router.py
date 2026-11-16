from fastapi import APIRouter, Query, Request

from life_app.core.database import Database
from life_app.platform.auth.service import CurrentUser
from life_app.platform.integrations import schemas as s
from life_app.platform.integrations import service as svc

router = APIRouter(prefix="/integrations", tags=["Intégrations"])


@router.get("", response_model=list[s.SourceDefinition])
def catalogue(request: Request, user: CurrentUser, db: Database):
    """Catalogue localisé, filtres et activation des sources ; aucune option privée."""
    return svc.catalogue(db, user, request.app.state.applications)


@router.get("/{application_id}/options/{filter_id}", response_model=s.OptionPage)
def options(
    application_id: str,
    filter_id: str,
    request: Request,
    user: CurrentUser,
    db: Database,
    q: str = Query("", max_length=160),
    offset: int = Query(0, ge=0, le=100000),
    limit: int = Query(30, ge=1, le=100),
):
    source = svc.provider(db, user, request.app.state.applications, application_id)
    return source.options(db, user, filter_id, q, offset, limit)


@router.post("/evaluate", response_model=s.Evaluated)
def evaluate(payload: s.Evaluation, request: Request, user: CurrentUser, db: Database):
    """Aperçu authentifié/CSRF, bornes civiles inclusives ; aucune écriture métier."""
    return s.Evaluated(
        query=payload, result=svc.evaluate(db, user, request.app.state.applications, payload)
    )
