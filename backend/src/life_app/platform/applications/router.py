from fastapi import APIRouter, Request

from life_app.core.database import Database
from life_app.platform.applications import service
from life_app.platform.applications.schemas import ActivationInput, ApplicationOutput
from life_app.platform.auth.service import CurrentUser

router = APIRouter(prefix="/applications", tags=["Bibliothèque des applications"])


@router.get("", response_model=list[ApplicationOutput])
def applications(request: Request, user: CurrentUser, db: Database):
    """Catalogue et activations du compte connecté, dans l'ordre d'affichage."""
    return service.catalogue(db, user, request.app.state.applications)


@router.put("/{application_id}", response_model=ApplicationOutput)
def activation(
    application_id: str, payload: ActivationInput, request: Request, user: CurrentUser, db: Database
):
    """Activer/désactiver sans supprimer les données ; répétition idempotente."""
    definition = service.find_application(request.app.state.applications, application_id)
    result = service.set_activation(db, user, definition, payload.enabled)
    db.commit()
    return result
