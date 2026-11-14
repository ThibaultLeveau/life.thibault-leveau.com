"""Composition root: installed applications, explicitly registered in display order."""

from life_app.apps.tasks.manifest import application as tasks

APPLICATIONS = (tasks,)
