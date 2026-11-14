"""Activation changes only the owner's preference, never application data."""

from fastapi import HTTPException
from sqlalchemy import select

from life_app.core.database import utcnow
from life_app.platform.applications.definition import ApplicationDefinition
from life_app.platform.applications.models import ApplicationPreference
from life_app.platform.applications.schemas import ApplicationOutput


def find_application(definitions, application_id: str) -> ApplicationDefinition:
    for definition in definitions:
        if definition.id == application_id:
            return definition
    raise HTTPException(404, "Application introuvable.")


def output(definition, preference) -> ApplicationOutput:
    return ApplicationOutput(
        id=definition.id,
        name=definition.name,
        description=definition.description,
        path=definition.path,
        icon=definition.icon,
        enabled=preference.enabled if preference else definition.default_enabled,
        updated_at=preference.updated_at if preference else None,
    )


def catalogue(db, user, definitions) -> list[ApplicationOutput]:
    preferences = {
        item.application_id: item
        for item in db.scalars(
            select(ApplicationPreference).where(ApplicationPreference.user_id == user.id)
        )
    }
    return [output(item, preferences.get(item.id)) for item in definitions]


def set_activation(db, user, definition, enabled: bool) -> ApplicationOutput:
    # CurrentUser holds the same owner lock as all application mutations.
    preference = db.get(ApplicationPreference, (user.id, definition.id))
    if preference is None:
        preference = ApplicationPreference(
            user_id=user.id, application_id=definition.id, enabled=enabled, updated_at=utcnow()
        )
        db.add(preference)
    elif preference.enabled != enabled:
        preference.enabled = enabled
        preference.updated_at = utcnow()
    db.flush()
    return output(definition, preference)
