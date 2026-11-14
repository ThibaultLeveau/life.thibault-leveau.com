from life_app.apps.tasks.router import router
from life_app.platform.applications.definition import ApplicationDefinition

application = ApplicationDefinition(
    id="tasks",
    name="Tâches",
    description="Organisez vos projets, planifiez votre quotidien et avancez à votre rythme.",
    path="/tasks",
    icon="check",
    router=router,
    default_enabled=True,
)
