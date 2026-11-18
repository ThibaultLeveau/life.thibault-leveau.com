from life_app.apps.recipes.assistant import provider as actions
from life_app.apps.recipes.integrations import provider as metrics
from life_app.apps.recipes.progression import provider as progression
from life_app.apps.recipes.router import router
from life_app.platform.applications.definition import ApplicationDefinition

application = ApplicationDefinition(
    id="recipes",
    name="Recettes & Liste de courses",
    description="Gardez vos recettes, ajustez les portions et préparez vos courses en un instant.",
    path="/recipes",
    icon="book",
    router=router,
    actions=actions,
    metrics=metrics,
    progression=progression,
    translations={
        "en": (
            "Recipes & Shopping Lists",
            "Save your recipes, adjust servings and get your shopping ready in moments.",
        )
    },
)
