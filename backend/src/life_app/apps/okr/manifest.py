from life_app.apps.okr.integrations import provider as metrics
from life_app.apps.okr.progression import provider as progression
from life_app.apps.okr.router import router
from life_app.platform.applications.definition import ApplicationDefinition

application = ApplicationDefinition(
    id="okr",
    name="Objectifs OKR",
    description="Dessinez votre avenir, avancez par résultats clés et célébrez chaque trimestre.",
    path="/okr",
    icon="flag",
    router=router,
    metrics=metrics,
    progression=progression,
    translations={
        "en": (
            "OKR Goals",
            "Shape your future, make progress with key results and celebrate each quarter.",
        )
    },
)
