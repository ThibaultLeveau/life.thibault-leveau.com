"""Recheck Life AI activation under the same owner lock as each long operation."""

from life_app.apps.life_ai.messages import failure
from life_app.platform.applications.models import ApplicationPreference


def require_enabled(db, user):
    preference = db.get(ApplicationPreference, (user.id, "life_ai"), populate_existing=True)
    if preference is None or not preference.enabled:
        raise failure(
            403,
            "assistant.application_disabled",
            headers={"X-Life-Application-Disabled": "life_ai"},
        )
