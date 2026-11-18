from life_app.apps.life_ai.router import router
from life_app.platform.applications.definition import ApplicationDefinition

application = ApplicationDefinition(
    id="life_ai",
    name="Life AI",
    description="Réfléchissez, planifiez et agissez avec votre assistant personnel.",
    path="/ai",
    icon="sparkles",
    router=router,
    translations={"en": ("Life AI", "Think, plan and take action with your personal assistant.")},
)
