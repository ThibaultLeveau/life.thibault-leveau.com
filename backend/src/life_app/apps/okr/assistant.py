"""Owned OKR capabilities, reusing the public API's models and domain services."""

from typing import Annotated
from uuid import UUID

from pydantic import Field

from life_app.apps.okr import schemas as s
from life_app.apps.okr import service as svc
from life_app.platform.assistant.definition import ActionDefinition, ActionProvider, arguments

Offset = Annotated[int, Field(ge=0)]
Limit = Annotated[int, Field(ge=1, le=100)]

provider = ActionProvider(
    actions=(
        ActionDefinition(
            name="list_objectives",
            description="List active or archived objectives across all four planning horizons.",
            input_model=arguments("OkrList", archived=(bool, False)),
            handler=lambda c, a: [svc.output(i) for i in svc.objectives(c.db, c.user, a.archived)],
            method="GET",
            path="/okr/objectives",
            output_model=list[s.ObjectiveOutput],
        ),
        ActionDefinition(
            name="create_objective",
            description="Create an objective with the details required by its horizon.",
            input_model=arguments("OkrCreate", payload=(s.ObjectiveInput, ...)),
            handler=lambda c, a: svc.output(svc.create(c.db, c.user, a.payload)),
            method="POST",
            path="/okr/objectives",
            mutating=True,
            output_model=s.ObjectiveOutput,
        ),
        ActionDefinition(
            name="get_objective",
            description="Read an owned objective, its key results, status, progress and version.",
            input_model=arguments("OkrGet", id=(UUID, ...)),
            handler=lambda c, a: svc.output(svc.owned(c.db, c.user, a.id)),
            method="GET",
            path="/okr/objectives/{id}",
            output_model=s.ObjectiveOutput,
        ),
        ActionDefinition(
            name="update_objective",
            description="Replace objective details at its expected version, preserving history.",
            input_model=arguments("OkrUpdate", id=(UUID, ...), payload=(s.ObjectiveUpdate, ...)),
            handler=lambda c, a: svc.output(
                svc.update(c.db, c.user, svc.owned(c.db, c.user, a.id), a.payload)
            ),
            method="PUT",
            path="/okr/objectives/{id}",
            mutating=True,
            output_model=s.ObjectiveOutput,
        ),
        ActionDefinition(
            name="move_objective",
            description="Move an objective to a kanban status and position; close or reopen it.",
            input_model=arguments("OkrMove", id=(UUID, ...), payload=(s.Move, ...)),
            handler=lambda c, a: svc.output(
                svc.move(c.db, c.user, svc.owned(c.db, c.user, a.id), a.payload)
            ),
            method="PUT",
            path="/okr/objectives/{id}/move",
            mutating=True,
            output_model=s.ObjectiveOutput,
        ),
        ActionDefinition(
            name="archive_objective",
            description="Archive or restore an objective, preserving key results and history.",
            input_model=arguments("OkrArchive", id=(UUID, ...), payload=(s.Archive, ...)),
            handler=lambda c, a: svc.output(
                svc.archive(c.db, c.user, svc.owned(c.db, c.user, a.id), a.payload)
            ),
            method="PUT",
            path="/okr/objectives/{id}/archive",
            mutating=True,
            confirmation=True,
            output_model=s.ObjectiveOutput,
        ),
        ActionDefinition(
            name="check_in",
            description="Record a key result value and note at the objective's expected version.",
            input_model=arguments(
                "OkrCheckIn",
                id=(UUID, ...),
                key_result_id=(UUID, ...),
                payload=(s.CheckIn, ...),
            ),
            handler=lambda c, a: svc.output(
                svc.check_in(
                    c.db, c.user, svc.owned(c.db, c.user, a.id), a.key_result_id, a.payload
                )
            ),
            method="PUT",
            path="/okr/objectives/{id}/key-results/{key_result_id}",
            mutating=True,
            output_model=s.ObjectiveOutput,
        ),
        ActionDefinition(
            name="objective_history",
            description="Read an owned objective's immutable history, newest version first.",
            input_model=arguments(
                "OkrHistory", id=(UUID, ...), offset=(Offset, 0), limit=(Limit, 30)
            ),
            handler=lambda c, a: svc.history(c.db, c.user, a.id, a.offset, a.limit),
            method="GET",
            path="/okr/objectives/{id}/history",
            output_model=list[s.EventOutput],
        ),
        ActionDefinition(
            name="achievements",
            description="Read completed objectives for a quarter with their historical snapshots.",
            input_model=arguments(
                "OkrAchievements",
                quarter=(s.Quarter | None, None),
                offset=(Offset, 0),
                limit=(Limit, 30),
            ),
            handler=lambda c, a: svc.achievements(c.db, c.user, a.quarter, a.offset, a.limit),
            method="GET",
            path="/okr/achievements",
            output_model=s.AchievementPage,
        ),
        ActionDefinition(
            name="get_settings",
            description="Read OKR timezone, preference version, today's date and current quarter.",
            input_model=arguments("OkrSettingsGet"),
            handler=lambda c, a: svc.settings(c.db, c.user),
            method="GET",
            path="/okr/settings",
            output_model=s.SettingsOutput,
        ),
        ActionDefinition(
            name="save_settings",
            description="Set the OKR timezone using the current preference version.",
            input_model=arguments("OkrSettingsSave", payload=(s.SettingsUpdate, ...)),
            handler=lambda c, a: svc.save_settings(c.db, c.user, a.payload),
            method="PUT",
            path="/okr/settings",
            mutating=True,
            output_model=s.SettingsOutput,
        ),
    )
)

provider = provider.with_labels(
    {
        "list_objectives": ("Consulter les objectifs", "View goals"),
        "create_objective": ("Créer un objectif", "Create a goal"),
        "get_objective": ("Consulter un objectif", "View a goal"),
        "update_objective": ("Modifier un objectif", "Update a goal"),
        "move_objective": ("Déplacer un objectif", "Move a goal"),
        "archive_objective": ("Archiver ou restaurer un objectif", "Archive or restore a goal"),
        "check_in": ("Actualiser un résultat clé", "Update a key result"),
        "objective_history": ("Consulter l’historique d’un objectif", "View goal history"),
        "achievements": ("Consulter les objectifs atteints", "View completed goals"),
        "get_settings": ("Consulter les réglages OKR", "View OKR settings"),
        "save_settings": ("Modifier les réglages OKR", "Update OKR settings"),
    }
)
