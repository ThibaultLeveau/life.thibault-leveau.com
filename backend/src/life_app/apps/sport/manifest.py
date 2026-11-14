from life_app.apps.sport.router import router
from life_app.platform.applications.definition import ApplicationDefinition

application = ApplicationDefinition(
    id="sport",
    name="Sport",
    path="/sport",
    icon="flag",
    router=router,
    description="Préparez vos séances, suivez vos entraînements et mesurez votre progression.",
)
