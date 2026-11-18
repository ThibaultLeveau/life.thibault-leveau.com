"""Typed Tasks capabilities, sharing the HTTP services and their owner checks."""

import hashlib
import json
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import Field, TypeAdapter
from sqlalchemy import select

from life_app.apps.tasks import models as m
from life_app.apps.tasks import schemas as s
from life_app.apps.tasks import service as svc
from life_app.core.i18n import locale
from life_app.platform.assistant.definition import ActionDefinition, ActionProvider, arguments


class WorkspaceEdit(s.WorkspacePatch):
    archived: None = None


class SectionEdit(s.SectionPatch):
    archived: None = None


class TaskEdit(s.TaskPatch):
    archived: None = None


class Archive(s.Schema):
    archived: bool


class TaskArchive(s.VersionInput):
    archived: bool


def action(
    name,
    description,
    method,
    path,
    handler,
    output_model=None,
    *,
    confirmation=False,
    mutating=None,
    precondition=None,
    preview_targets=None,
    **fields,
):
    output_adapter = TypeAdapter(output_model)

    def run(context, payload):
        result = handler(context, payload)
        context.db.flush()
        return output_adapter.validate_python(result, from_attributes=True)

    return ActionDefinition(
        name=name,
        description=description,
        input_model=arguments(
            "Tasks" + "".join(part.title() for part in name.split("_")), **fields
        ),
        handler=run,
        method=method,
        path=path,
        mutating=method != "GET" if mutating is None else mutating,
        confirmation=confirmation,
        output_model=output_model,
        precondition=precondition,
        preview_targets=preview_targets,
    )


def patch_workspace(context, workspace_id, payload):
    item = svc.workspace(context.db, context.user, workspace_id)
    svc.patch_workspace(context.db, context.user, item, payload)
    return item


def save_agenda(context, payload):
    svc.save_agenda_settings(context.db, context.user, payload)
    return payload


def task_change(context, task_id, payload, operation, *extra):
    item = operation(
        context.db, context.user, svc.task(context.db, context.user, task_id), payload, *extra
    )
    return svc.output(context.db, item)


def snapshot(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def entity_precondition(model, schema, id_field):
    def current(context, payload):
        space = svc.workspace(context.db, context.user, payload.workspace_id)
        item = (
            space
            if model is m.Workspace
            else svc.member(context.db, model, getattr(payload, id_field), space.id)
        )
        return snapshot(schema.model_validate(item).model_dump(mode="json"))

    return current


def ordered_targets(model):
    def names(context, payload):
        ids = payload.payload.ids
        if model is m.Workspace:
            items = {
                item.id: item
                for item in context.db.scalars(
                    select(model).where(model.owner_id == context.user.id, model.id.in_(ids))
                )
            }
            return [
                (items.get(id) or svc.workspace(context.db, context.user, id)).name for id in ids
            ]
        space = svc.workspace(context.db, context.user, payload.workspace_id)
        items = {
            item.id: item
            for item in context.db.scalars(
                select(model).where(model.workspace_id == space.id, model.id.in_(ids))
            )
        }
        return [
            f"{space.name} › {(items.get(id) or svc.member(context.db, model, id, space.id)).name}"
            for id in ids
        ]

    return names


def workspace_edit_targets(context, payload):
    space = svc.workspace(context.db, context.user, payload.workspace_id)
    result = [space.name]
    if "parent_id" in payload.payload.model_fields_set:
        destination = (
            svc.workspace(context.db, context.user, payload.payload.parent_id).name
            if payload.payload.parent_id
            else "Racine"
            if locale() == "fr"
            else "Root"
        )
        result.append(f"Destination : {destination}")
    return result


def moved_task_targets(context, payload):
    item = svc.task(context.db, context.user, payload.task_id)
    space = svc.workspace(context.db, context.user, payload.payload.workspace_id)
    destination = space.name
    if payload.payload.section_id:
        section = svc.member(context.db, m.Section, payload.payload.section_id, space.id)
        destination += f" › {section.name}"
    return [item.title, f"Destination : {destination}"]


def deleted_label_targets(context, payload):
    space = svc.workspace(context.db, context.user, payload.workspace_id)
    label = svc.member(context.db, m.Label, payload.label_id, space.id)
    return [f"{space.name} › {label.name}"]


def deleted_status_targets(context, payload):
    space = svc.workspace(context.db, context.user, payload.workspace_id)
    status = svc.member(context.db, m.Status, payload.status_id, space.id)
    result = [f"{space.name} › {status.name}"]
    if payload.replacement_id:
        replacement = svc.member(context.db, m.Status, payload.replacement_id, space.id)
        label = "Réaffecter vers" if locale() == "fr" else "Reassign to"
        result.append(f"{label} : {replacement.name}")
    return result


def structure_precondition(context, payload):
    """Unversioned structural changes must retain the state shown in their preview.

    Include workspace membership and affected task versions, so an intervening
    move, creation, archive or label edit invalidates the proposal as well.
    """
    db, user = context.db, context.user
    workspace_id = getattr(payload, "workspace_id", None)
    if workspace_id is not None:
        svc.workspace(db, user, workspace_id)
    workspaces = db.scalars(
        select(m.Workspace).where(m.Workspace.owner_id == user.id).order_by(m.Workspace.id)
    ).all()
    ids = [workspace_id] if workspace_id is not None else [item.id for item in workspaces]
    tasks = db.execute(
        select(m.Task.id, m.Task.version, m.Task.workspace_id, m.Task.section_id, m.Task.status_id)
        .where(m.Task.workspace_id.in_(ids))
        .order_by(m.Task.id)
    ).all()
    state = {
        "workspaces": [
            s.WorkspaceOutput.model_validate(item).model_dump(mode="json") for item in workspaces
        ],
        "tasks": [tuple(map(str, row)) for row in tasks],
    }
    for name, model, schema in (
        ("sections", m.Section, s.SectionOutput),
        ("statuses", m.Status, s.StatusOutput),
        ("labels", m.Label, s.LabelOutput),
    ):
        items = db.scalars(
            select(model).where(model.workspace_id.in_(ids)).order_by(model.id)
        ).all()
        state[name] = [schema.model_validate(item).model_dump(mode="json") for item in items]
    state["task_labels"] = [
        tuple(map(str, row))
        for row in db.execute(
            select(m.TaskLabel.task_id, m.TaskLabel.label_id)
            .where(m.TaskLabel.workspace_id.in_(ids))
            .order_by(m.TaskLabel.task_id, m.TaskLabel.label_id)
        )
    ]
    return snapshot(state)


provider = ActionProvider(
    actions=(
        action(
            "parse_schedule",
            "Analyser dates/récurrences FR/EN sans écriture / Parse schedule.",
            "POST",
            "/scheduling/parse",
            lambda c, p: svc.parse_scheduling(p.payload),
            s.ScheduleParseOutput,
            mutating=False,
            payload=(s.ScheduleParseInput, ...),
        ),
        action(
            "preview_schedule",
            "Prévisualiser les occurrences / Preview recurrence dates.",
            "POST",
            "/scheduling/preview",
            lambda c, p: svc.preview_scheduling(p.payload),
            s.SchedulePreviewOutput,
            mutating=False,
            payload=(s.SchedulePreviewInput, ...),
        ),
        action(
            "get_agenda_settings",
            "Lire les réglages À venir / Read agenda settings.",
            "GET",
            "/agenda/view",
            lambda c, p: svc.agenda_settings(c.db, c.user),
            s.AgendaSettings,
        ),
        action(
            "save_agenda_settings",
            "Remplacer les réglages À venir / Replace agenda settings.",
            "PUT",
            "/agenda/view",
            lambda c, p: save_agenda(c, p.payload),
            s.AgendaSettings,
            precondition=lambda c, p: snapshot(
                svc.agenda_settings(c.db, c.user).model_dump(mode="json")
            ),
            payload=(s.AgendaSettings, ...),
        ),
        action(
            "list_agenda",
            "Tâches à venir paginées / List upcoming tasks; pass the local today date.",
            "GET",
            "/agenda/tasks",
            lambda c, p: svc.agenda_tasks(c.db, c.user, p.today or date.today(), p.offset, p.limit),
            s.AgendaPage,
            today=(date | None, None),
            offset=(int, Field(0, ge=0)),
            limit=(int, Field(100, ge=1, le=200)),
        ),
        action(
            "list_workspaces",
            "Lister les espaces actifs ou archivés / List workspaces.",
            "GET",
            "/workspaces",
            lambda c, p: svc.list_workspaces(c.db, c.user, p.archived),
            list[s.WorkspaceOutput],
            archived=(bool, False),
        ),
        action(
            "create_workspace",
            "Créer un espace ou sous-espace / Create workspace.",
            "POST",
            "/workspaces",
            lambda c, p: svc.create_workspace(c.db, c.user, p.payload),
            s.WorkspaceOutput,
            payload=(s.WorkspaceCreate, ...),
        ),
        action(
            "reorder_workspaces",
            "Réordonner tous les espaces, archives incluses / Reorder workspaces.",
            "PUT",
            "/workspaces/order",
            lambda c, p: svc.reorder_workspaces(c.db, c.user, p.payload),
            confirmation=True,
            precondition=structure_precondition,
            preview_targets=ordered_targets(m.Workspace),
            payload=(s.Reorder, ...),
        ),
        action(
            "get_workspace",
            "Lire un espace / Read workspace.",
            "GET",
            "/workspaces/{workspace_id}",
            lambda c, p: svc.workspace(c.db, c.user, p.workspace_id),
            s.WorkspaceOutput,
            workspace_id=(UUID, ...),
        ),
        action(
            "edit_workspace",
            "Renommer, modifier ou déplacer un espace / Edit workspace.",
            "PATCH",
            "/workspaces/{workspace_id}",
            lambda c, p: patch_workspace(c, p.workspace_id, p.payload),
            s.WorkspaceOutput,
            precondition=entity_precondition(m.Workspace, s.WorkspaceOutput, "workspace_id"),
            preview_targets=workspace_edit_targets,
            workspace_id=(UUID, ...),
            payload=(WorkspaceEdit, ...),
        ),
        action(
            "archive_workspace",
            "Archiver ou restaurer un espace / Archive or restore workspace.",
            "PATCH",
            "/workspaces/{workspace_id}",
            lambda c, p: patch_workspace(
                c, p.workspace_id, s.WorkspacePatch(**p.payload.model_dump())
            ),
            s.WorkspaceOutput,
            confirmation=True,
            precondition=structure_precondition,
            workspace_id=(UUID, ...),
            payload=(Archive, ...),
        ),
        action(
            "list_sections",
            "Lister les sections d’un espace / List sections.",
            "GET",
            "/workspaces/{workspace_id}/sections",
            lambda c, p: svc.list_sections(c.db, c.user, p.workspace_id, p.archived),
            list[s.SectionOutput],
            workspace_id=(UUID, ...),
            archived=(bool, False),
        ),
        action(
            "create_section",
            "Créer une section / Create section.",
            "POST",
            "/workspaces/{workspace_id}/sections",
            lambda c, p: svc.create_section(c.db, c.user, p.workspace_id, p.payload),
            s.SectionOutput,
            workspace_id=(UUID, ...),
            payload=(s.SectionCreate, ...),
        ),
        action(
            "reorder_sections",
            "Réordonner toutes les sections, archives incluses / Reorder sections.",
            "PUT",
            "/workspaces/{workspace_id}/sections/order",
            lambda c, p: svc.reorder_sections(c.db, c.user, p.workspace_id, p.payload),
            confirmation=True,
            precondition=structure_precondition,
            preview_targets=ordered_targets(m.Section),
            workspace_id=(UUID, ...),
            payload=(s.Reorder, ...),
        ),
        action(
            "edit_section",
            "Modifier une section / Edit section.",
            "PATCH",
            "/workspaces/{workspace_id}/sections/{section_id}",
            lambda c, p: svc.update_section(c.db, c.user, p.workspace_id, p.section_id, p.payload),
            s.SectionOutput,
            precondition=entity_precondition(m.Section, s.SectionOutput, "section_id"),
            workspace_id=(UUID, ...),
            section_id=(UUID, ...),
            payload=(SectionEdit, ...),
        ),
        action(
            "archive_section",
            "Archiver ou restaurer une section / Archive or restore section.",
            "PATCH",
            "/workspaces/{workspace_id}/sections/{section_id}",
            lambda c, p: svc.update_section(
                c.db, c.user, p.workspace_id, p.section_id, s.SectionPatch(**p.payload.model_dump())
            ),
            s.SectionOutput,
            confirmation=True,
            precondition=structure_precondition,
            workspace_id=(UUID, ...),
            section_id=(UUID, ...),
            payload=(Archive, ...),
        ),
        action(
            "list_statuses",
            "Lister les statuts de l’espace / List workspace statuses.",
            "GET",
            "/workspaces/{workspace_id}/statuses",
            lambda c, p: svc.list_statuses(c.db, c.user, p.workspace_id),
            list[s.StatusOutput],
            workspace_id=(UUID, ...),
        ),
        action(
            "create_status",
            "Créer un statut / Create status.",
            "POST",
            "/workspaces/{workspace_id}/statuses",
            lambda c, p: svc.create_status(c.db, c.user, p.workspace_id, p.payload),
            s.StatusOutput,
            workspace_id=(UUID, ...),
            payload=(s.StatusCreate, ...),
        ),
        action(
            "reorder_statuses",
            "Réordonner les statuts / Reorder statuses.",
            "PUT",
            "/workspaces/{workspace_id}/statuses/order",
            lambda c, p: svc.reorder_statuses(c.db, c.user, p.workspace_id, p.payload),
            confirmation=True,
            precondition=structure_precondition,
            preview_targets=ordered_targets(m.Status),
            workspace_id=(UUID, ...),
            payload=(s.Reorder, ...),
        ),
        action(
            "edit_status",
            "Modifier un statut / Edit status.",
            "PATCH",
            "/workspaces/{workspace_id}/statuses/{status_id}",
            lambda c, p: svc.update_status(c.db, c.user, p.workspace_id, p.status_id, p.payload),
            s.StatusOutput,
            precondition=entity_precondition(m.Status, s.StatusOutput, "status_id"),
            workspace_id=(UUID, ...),
            status_id=(UUID, ...),
            payload=(s.StatusPatch, ...),
        ),
        action(
            "delete_status",
            "Supprimer un statut avec réaffectation / Delete status with replacement.",
            "DELETE",
            "/workspaces/{workspace_id}/statuses/{status_id}",
            lambda c, p: svc.delete_status(
                c.db, c.user, p.workspace_id, p.status_id, p.replacement_id
            ),
            confirmation=True,
            precondition=structure_precondition,
            preview_targets=deleted_status_targets,
            workspace_id=(UUID, ...),
            status_id=(UUID, ...),
            replacement_id=(UUID | None, None),
        ),
        action(
            "list_labels",
            "Lister les étiquettes / List labels.",
            "GET",
            "/workspaces/{workspace_id}/labels",
            lambda c, p: svc.list_labels(c.db, c.user, p.workspace_id),
            list[s.LabelOutput],
            workspace_id=(UUID, ...),
        ),
        action(
            "create_label",
            "Créer une étiquette / Create label.",
            "POST",
            "/workspaces/{workspace_id}/labels",
            lambda c, p: svc.create_label(c.db, c.user, p.workspace_id, p.payload),
            s.LabelOutput,
            workspace_id=(UUID, ...),
            payload=(s.LabelCreate, ...),
        ),
        action(
            "edit_label",
            "Modifier une étiquette / Edit label.",
            "PUT",
            "/workspaces/{workspace_id}/labels/{label_id}",
            lambda c, p: svc.update_label(c.db, c.user, p.workspace_id, p.label_id, p.payload),
            s.LabelOutput,
            precondition=entity_precondition(m.Label, s.LabelOutput, "label_id"),
            workspace_id=(UUID, ...),
            label_id=(UUID, ...),
            payload=(s.LabelCreate, ...),
        ),
        action(
            "delete_label",
            "Supprimer une étiquette de l’espace et des tâches / Delete label.",
            "DELETE",
            "/workspaces/{workspace_id}/labels/{label_id}",
            lambda c, p: svc.delete_label(c.db, c.user, p.workspace_id, p.label_id),
            confirmation=True,
            precondition=structure_precondition,
            preview_targets=deleted_label_targets,
            workspace_id=(UUID, ...),
            label_id=(UUID, ...),
        ),
        action(
            "get_view",
            "Lire les préférences de vue / Read workspace view settings.",
            "GET",
            "/workspaces/{workspace_id}/view",
            lambda c, p: svc.view_settings(c.db, c.user, p.workspace_id),
            s.ViewSettings,
            workspace_id=(UUID, ...),
        ),
        action(
            "save_view",
            "Remplacer les préférences de vue / Replace workspace view settings.",
            "PUT",
            "/workspaces/{workspace_id}/view",
            lambda c, p: svc.save_view_settings(c.db, c.user, p.workspace_id, p.payload),
            s.ViewSettings,
            precondition=lambda c, p: snapshot(
                svc.view_settings(c.db, c.user, p.workspace_id).model_dump(mode="json")
            ),
            workspace_id=(UUID, ...),
            payload=(s.ViewSettings, ...),
        ),
        action(
            "list_tasks",
            "Rechercher les tâches avec filtres et pagination / Search tasks.",
            "GET",
            "/tasks",
            lambda c, p: svc.list_tasks(c.db, c.user, **p.model_dump()),
            s.TaskPage,
            workspace_id=(UUID | None, None),
            section_id=(UUID | None, None),
            status_id=(UUID | None, None),
            priority=(int | None, Field(None, ge=1, le=4)),
            label_id=(UUID | None, None),
            search=(str, Field("", max_length=500)),
            completed=(bool | None, None),
            archived=(bool, False),
            due=(Literal["all", "overdue", "today", "upcoming", "none"], "all"),
            today=(date | None, None),
            sort=(Literal["manual", "priority", "due_date"], "manual"),
            offset=(int, Field(0, ge=0)),
            limit=(int, Field(100, ge=1, le=200)),
        ),
        action(
            "create_task",
            "Créer une tâche avec dates et récurrence éventuelle / Create task.",
            "POST",
            "/tasks",
            lambda c, p: svc.output(c.db, svc.create_task(c.db, c.user, p.payload)),
            s.TaskOutput,
            payload=(s.TaskCreate, ...),
        ),
        action(
            "bulk_tasks",
            "Lot atomique : déplacer, planifier, résoudre, archiver, etc. / Atomic task batch.",
            "POST",
            "/tasks/bulk",
            lambda c, p: svc.bulk_tasks(c.db, c.user, p.payload),
            list[s.TaskOutput],
            confirmation=True,
            preview_targets=lambda c, p: [
                svc.task(c.db, c.user, reference.id).title for reference in p.payload.tasks
            ],
            payload=(s.BulkInput, ...),
        ),
        action(
            "duplicate_task",
            "Dupliquer une tâche, sans historique hérité / Duplicate task.",
            "POST",
            "/tasks/{task_id}/duplicate",
            lambda c, p: task_change(c, p.task_id, p.payload, svc.duplicate_task),
            s.TaskOutput,
            task_id=(UUID, ...),
            payload=(s.VersionInput, ...),
        ),
        action(
            "get_task",
            "Lire une tâche / Read task.",
            "GET",
            "/tasks/{task_id}",
            lambda c, p: svc.output(c.db, svc.task(c.db, c.user, p.task_id)),
            s.TaskOutput,
            task_id=(UUID, ...),
        ),
        action(
            "edit_task",
            "Modifier une tâche avec version attendue / Edit task with expected version.",
            "PATCH",
            "/tasks/{task_id}",
            lambda c, p: task_change(c, p.task_id, p.payload, svc.patch_task),
            s.TaskOutput,
            task_id=(UUID, ...),
            payload=(TaskEdit, ...),
        ),
        action(
            "archive_task",
            "Archiver ou restaurer une tâche / Archive or restore task.",
            "PATCH",
            "/tasks/{task_id}",
            lambda c, p: task_change(
                c, p.task_id, s.TaskPatch(**p.payload.model_dump()), svc.patch_task
            ),
            s.TaskOutput,
            confirmation=True,
            task_id=(UUID, ...),
            payload=(TaskArchive, ...),
        ),
        action(
            "move_task",
            "Déplacer/réordonner une tâche ; statut cible explicite / Move task.",
            "POST",
            "/tasks/{task_id}/move",
            lambda c, p: task_change(c, p.task_id, p.payload, svc.move_task),
            s.TaskOutput,
            preview_targets=moved_task_targets,
            task_id=(UUID, ...),
            payload=(s.MoveInput, ...),
        ),
        action(
            "complete_task",
            "Résoudre une occurrence ; avancer une récurrence / Complete task occurrence.",
            "POST",
            "/tasks/{task_id}/complete",
            lambda c, p: task_change(c, p.task_id, p.payload, svc.complete_task, True),
            s.TaskOutput,
            task_id=(UUID, ...),
            payload=(s.VersionInput, ...),
        ),
        action(
            "reopen_task",
            "Réouvrir une tâche en conservant son historique / Reopen task.",
            "POST",
            "/tasks/{task_id}/reopen",
            lambda c, p: task_change(c, p.task_id, p.payload, svc.complete_task, False),
            s.TaskOutput,
            task_id=(UUID, ...),
            payload=(s.VersionInput, ...),
        ),
        action(
            "undo_completion",
            "Annuler la dernière résolution sans effacer le journal / Undo completion.",
            "POST",
            "/tasks/{task_id}/undo-complete",
            lambda c, p: task_change(c, p.task_id, p.payload, svc.undo_complete),
            s.TaskOutput,
            task_id=(UUID, ...),
            payload=(s.VersionInput, ...),
        ),
        action(
            "task_history",
            "Lire l’historique paginé d’une tâche / Read task history.",
            "GET",
            "/tasks/{task_id}/events",
            lambda c, p: svc.task_events(c.db, c.user, p.task_id, p.offset, p.limit),
            s.EventPage,
            task_id=(UUID, ...),
            offset=(int, Field(0, ge=0)),
            limit=(int, Field(100, ge=1, le=200)),
        ),
    )
)

provider = provider.with_labels(
    {
        "parse_schedule": ("Comprendre une échéance", "Interpret a due date"),
        "preview_schedule": ("Aperçu des prochaines occurrences", "Preview upcoming occurrences"),
        "get_agenda_settings": ("Réglages À venir", "Upcoming view settings"),
        "save_agenda_settings": ("Modifier les réglages À venir", "Change upcoming view settings"),
        "list_agenda": ("Tâches à venir", "Upcoming tasks"),
        "list_workspaces": ("Espaces de tâches", "Task workspaces"),
        "create_workspace": ("Créer un espace", "Create a workspace"),
        "reorder_workspaces": ("Réordonner les espaces", "Reorder workspaces"),
        "get_workspace": ("Détails de l’espace", "Workspace details"),
        "edit_workspace": ("Modifier un espace", "Edit a workspace"),
        "archive_workspace": ("Archiver ou restaurer un espace", "Archive or restore a workspace"),
        "list_sections": ("Sections de l’espace", "Workspace sections"),
        "create_section": ("Créer une section", "Create a section"),
        "reorder_sections": ("Réordonner les sections", "Reorder sections"),
        "edit_section": ("Modifier une section", "Edit a section"),
        "archive_section": ("Archiver ou restaurer une section", "Archive or restore a section"),
        "list_statuses": ("Statuts de l’espace", "Workspace statuses"),
        "create_status": ("Créer un statut", "Create a status"),
        "reorder_statuses": ("Réordonner les statuts", "Reorder statuses"),
        "edit_status": ("Modifier un statut", "Edit a status"),
        "delete_status": ("Supprimer un statut", "Delete a status"),
        "list_labels": ("Étiquettes de l’espace", "Workspace labels"),
        "create_label": ("Créer une étiquette", "Create a label"),
        "edit_label": ("Modifier une étiquette", "Edit a label"),
        "delete_label": ("Supprimer une étiquette", "Delete a label"),
        "get_view": ("Préférences d’affichage", "View preferences"),
        "save_view": ("Modifier l’affichage", "Change view preferences"),
        "list_tasks": ("Rechercher les tâches", "Search tasks"),
        "create_task": ("Créer une tâche", "Create a task"),
        "bulk_tasks": ("Modifier plusieurs tâches", "Change multiple tasks"),
        "duplicate_task": ("Dupliquer une tâche", "Duplicate a task"),
        "get_task": ("Détails de la tâche", "Task details"),
        "edit_task": ("Modifier une tâche", "Edit a task"),
        "archive_task": ("Archiver ou restaurer une tâche", "Archive or restore a task"),
        "move_task": ("Déplacer une tâche", "Move a task"),
        "complete_task": ("Terminer une tâche", "Complete a task"),
        "reopen_task": ("Rouvrir une tâche", "Reopen a task"),
        "undo_completion": ("Annuler la dernière résolution", "Undo the latest completion"),
        "task_history": ("Historique de la tâche", "Task history"),
    }
)
