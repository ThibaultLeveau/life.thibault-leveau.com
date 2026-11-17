from life_app.apps.tasks.assistant import provider as actions
from life_app.apps.tasks.integrations import TasksMetrics
from life_app.apps.tasks.progression import provider as progression
from life_app.apps.tasks.router import router
from life_app.platform.applications.definition import ApplicationDefinition

application = ApplicationDefinition(
    id="tasks",
    name="Tâches",
    description="Organisez vos projets, planifiez votre quotidien et avancez à votre rythme.",
    path="/tasks",
    icon="check",
    router=router,
    actions=actions,
    progression=progression,
    metrics=TasksMetrics(),
    default_enabled=True,
    translations={
        "en": ("Tasks", "Organize your projects, plan your day and move at your own pace."),
    },
)
