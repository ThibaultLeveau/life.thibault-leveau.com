"""Shared provider configuration for Life AI and structured generation."""

from fastapi import APIRouter, Request

from life_app.core.database import Database
from life_app.platform.assistant import credentials, service
from life_app.platform.assistant import schemas as s
from life_app.platform.assistant.messages import failure
from life_app.platform.assistant.providers import ProviderError, ProviderSession
from life_app.platform.auth.service import CurrentUser

router = APIRouter(prefix="/assistant", tags=["AI provider"])


@router.get("/provider-settings", response_model=s.SettingsOutput)
def get_settings(user: CurrentUser, db: Database):
    return service.settings_output(service.settings(db, user))


@router.put("/provider-settings", response_model=s.SettingsOutput)
def put_settings(payload: s.SettingsInput, request: Request, user: CurrentUser, db: Database):
    result = service.update_settings(db, user, request.app.state.settings, payload)
    db.commit()
    return result


@router.post("/provider-settings/test", response_model=s.CheckOutput)
def check_settings(request: Request, user: CurrentUser, db: Database):
    config = service.settings(db, user)
    token = credentials.decrypt(request.app.state.settings, config)
    if not config.model:
        raise failure(409, "assistant.provider_not_configured")
    provider, model = config.provider, config.model
    db.commit()
    factory = getattr(request.app.state, "assistant_provider_factory", ProviderSession)
    session = factory(
        provider,
        model,
        token,
        "Reply with OK only. Do not call tools.",
        [{"role": "user", "content": "Connection test"}],
    )
    try:
        for _ in session.respond([]):
            pass
    except ProviderError as error:
        raise failure(502, error.code) from None
    return {"ok": True}
