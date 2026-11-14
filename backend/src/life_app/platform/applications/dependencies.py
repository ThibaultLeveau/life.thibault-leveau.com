from fastapi import HTTPException, Request

from life_app.core.database import Database
from life_app.platform.applications.models import ApplicationPreference
from life_app.platform.applications.service import find_application
from life_app.platform.auth.service import CurrentUser


def require_application(application_id: str):
    def enabled(request: Request, user: CurrentUser, db: Database):
        definition = find_application(request.app.state.applications, application_id)
        preference = db.get(ApplicationPreference, (user.id, application_id))
        active = preference.enabled if preference else definition.default_enabled
        if not active:
            raise HTTPException(
                403,
                "Cette application est désactivée. Activez-la dans la bibliothèque.",
                headers={"X-Life-Application-Disabled": application_id},
            )

    return enabled
