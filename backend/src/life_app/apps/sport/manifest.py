from life_app.apps.sport.assistant import provider as actions
from life_app.apps.sport.integrations import SportMetrics
from life_app.apps.sport.progression import provider as progression
from life_app.apps.sport.router import router
from life_app.platform.applications.definition import ApplicationDefinition

application = ApplicationDefinition(
    id="sport",
    name="Sport",
    path="/sport",
    icon="dumbbell",
    router=router,
    actions=actions,
    progression=progression,
    metrics=SportMetrics(),
    description="Composez vos programmes, suivez vos entraînements et mesurez votre progression.",
    translations={
        "en": ("Sport", "Build your programs, track your training and measure your progress."),
    },
)
