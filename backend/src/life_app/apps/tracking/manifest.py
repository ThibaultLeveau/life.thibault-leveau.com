from life_app.apps.tracking.assistant import provider as actions
from life_app.apps.tracking.progression import provider as progression
from life_app.apps.tracking.router import router
from life_app.platform.applications.definition import ApplicationDefinition

application = ApplicationDefinition(
    id="tracking",
    name="Suivi",
    description="Cultivez vos habitudes, reliez vos applications et rendez vos progrès visibles.",
    path="/tracking",
    icon="calendar",
    router=router,
    actions=actions,
    progression=progression,
    translations={
        "en": (
            "Tracking",
            "Build habits, connect your applications and make your progress visible.",
        )
    },
)
