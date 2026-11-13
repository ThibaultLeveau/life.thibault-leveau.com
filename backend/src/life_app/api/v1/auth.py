from fastapi import APIRouter, Request, Response

from life_app.core.database import Database
from life_app.features.auth import service
from life_app.features.auth.schemas import LoginInput, Preferences, SessionOutput
from life_app.features.auth.service import CurrentUser

router = APIRouter(tags=["Connexion et préférences"])


@router.post("/auth/session", response_model=SessionOutput)
def login(payload: LoginInput, request: Request, response: Response, db: Database):
    """Ouvrir une session et recevoir le jeton à envoyer dans X-CSRF-Token."""
    user, session, token, csrf = service.login(db, request, payload.username, payload.password)
    response.set_cookie(
        service.COOKIE,
        token,
        httponly=True,
        secure=request.app.state.settings.environment == "production",
        samesite="lax",
        max_age=request.app.state.settings.session_hours * 3600,
        path="/",
    )
    return SessionOutput(
        user_id=user.id,
        username=user.username,
        theme=user.theme,
        expires_at=session.expires_at,
        csrf_token=csrf,
    )


@router.get("/auth/session", response_model=SessionOutput)
def session(request: Request, user: CurrentUser):
    """Retrouver la session et son jeton CSRF après rechargement."""
    return SessionOutput(
        user_id=user.id,
        username=user.username,
        theme=user.theme,
        expires_at=request.state.login_session.expires_at,
        csrf_token=request.state.csrf_token,
    )


@router.delete("/auth/session", status_code=204)
def logout(request: Request, response: Response, user: CurrentUser, db: Database):
    """Révoquer immédiatement la session courante."""
    db.delete(request.state.login_session)
    db.commit()
    response.delete_cookie(
        service.COOKIE,
        path="/",
        httponly=True,
        secure=request.app.state.settings.environment == "production",
        samesite="lax",
    )


@router.get("/preferences", response_model=Preferences)
def preferences(user: CurrentUser):
    return user


@router.put("/preferences", response_model=Preferences)
def set_preferences(payload: Preferences, user: CurrentUser, db: Database):
    user.theme = payload.theme
    db.commit()
    return user
