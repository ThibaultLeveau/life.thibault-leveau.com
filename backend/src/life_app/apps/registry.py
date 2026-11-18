"""Composition root: installed applications, explicitly registered in display order."""

from life_app.apps.life_ai.manifest import application as life_ai
from life_app.apps.okr.manifest import application as okr
from life_app.apps.recipes.manifest import application as recipes
from life_app.apps.sport.manifest import application as sport
from life_app.apps.tasks.manifest import application as tasks
from life_app.apps.tracking.manifest import application as tracking

APPLICATIONS = (tasks, sport, tracking, okr, recipes, life_ai)
