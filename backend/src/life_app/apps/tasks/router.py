from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query

from life_app.apps.tasks import schemas as s
from life_app.apps.tasks import service as svc
from life_app.core.database import Database
from life_app.platform.auth.service import CurrentUser

router = APIRouter(tags=["Tâches"])


def committed(db, item, schema):
    db.flush()
    result = schema.model_validate(item)
    db.commit()
    return result


def committed_task(db, item):
    result = svc.output(db, item)
    db.commit()
    return result


@router.post("/scheduling/parse", response_model=s.ScheduleParseOutput)
def parse_scheduling(payload: s.ScheduleParseInput, user: CurrentUser):
    """Analyser le français sans écrire de tâche ; texte reconnu et indices Unicode renvoyés.

    Nombres français, cadence et sélections calendaires composables dans différents ordres.
    Dates relatives à today, fuseau IANA pour les récurrences. Texte entre guillemets
    conservé. status=none pour du texte littéral ; incomplete/invalid avec diagnostic
    français sans appliquer de calendrier partiel. recognized expose l’aperçu et la règle.
    """
    return svc.parse_scheduling(payload)


@router.post("/scheduling/preview", response_model=s.SchedulePreviewOutput)
def preview_scheduling(payload: s.SchedulePreviewInput, user: CurrentUser):
    """Prévisualiser jusqu’à 12 dates sans écriture ; mêmes règles que la résolution.

    En mode completion, aperçu indicatif supposant chaque résolution à l’échéance.
    Les dates inexistantes sont sautées selon RFC 5545. Fin inclusive et exclusions.
    """
    return svc.preview_scheduling(payload)


@router.get("/agenda/view", response_model=s.AgendaSettings)
def agenda_view(user: CurrentUser, db: Database):
    """Réglages globaux du compte ; valeurs par défaut avant le premier enregistrement."""
    return svc.agenda_settings(db, user)


@router.put("/agenda/view", response_model=s.AgendaSettings)
def update_agenda_view(payload: s.AgendaSettings, user: CurrentUser, db: Database):
    """Remplacer les réglages du compte ; champs omis remis au défaut, sans modifier les tâches."""
    svc.save_agenda_settings(db, user, payload)
    db.commit()
    return payload


@router.get("/agenda/tasks", response_model=s.AgendaPage)
def agenda_tasks(
    user: CurrentUser,
    db: Database,
    today: Annotated[
        date | None, Query(description="Date locale du client ; date serveur si omise.")
    ] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    """Tâches de tous les espaces actifs selon /agenda/view, triées par échéance.

    today : jour courant ; tomorrow : lendemain ; week : aujourd'hui et les six jours
    suivants ; custom : custom_days jours dès aujourd'hui (1–90). Bornes inclusives.
    include_overdue ajoute les tâches non terminées antérieures à today.
    Les tâches sans date et les archives (espace, section ou tâche) sont exclues.
    """
    return svc.agenda_tasks(db, user, today or date.today(), offset, limit)


@router.get("/workspaces", response_model=list[s.WorkspaceOutput])
def workspaces(user: CurrentUser, db: Database, archived: bool = False):
    return svc.list_workspaces(db, user, archived)


@router.post("/workspaces", response_model=s.WorkspaceOutput, status_code=201)
def create_workspace(payload: s.WorkspaceCreate, user: CurrentUser, db: Database):
    """Créer un espace racine ou enfant d'un parent actif du même propriétaire.

    Parent absent/étranger : 404 ; parent archivé : 409.
    Trois statuts initiaux et des préférences propres sont créés.
    """
    return committed(db, svc.create_workspace(db, user, payload), s.WorkspaceOutput)


@router.put("/workspaces/order", status_code=204)
def reorder_workspaces(payload: s.Reorder, user: CurrentUser, db: Database):
    """Donner l'ordre complet des espaces du propriétaire, archives incluses."""
    svc.reorder_workspaces(db, user, payload)
    db.commit()


@router.get("/workspaces/{workspace_id}", response_model=s.WorkspaceOutput)
def get_workspace(workspace_id: UUID, user: CurrentUser, db: Database):
    return svc.workspace(db, user, workspace_id)


@router.patch("/workspaces/{workspace_id}", response_model=s.WorkspaceOutput)
def patch_workspace(workspace_id: UUID, payload: s.WorkspacePatch, user: CurrentUser, db: Database):
    """Modifier un espace, le rattacher ou le remettre à la racine avec parent_id=null.

    Parent absent/étranger : 404. Cycle, parent archivé lors d'un rattachement ou
    d'une restauration, archivage avec enfants actifs : 409. Les tâches restent inchangées.
    """
    item = svc.workspace(db, user, workspace_id)
    svc.patch_workspace(db, user, item, payload)
    return committed(db, item, s.WorkspaceOutput)


@router.get("/workspaces/{workspace_id}/sections", response_model=list[s.SectionOutput])
def sections(workspace_id: UUID, user: CurrentUser, db: Database, archived: bool = False):
    return svc.list_sections(db, user, workspace_id, archived)


@router.post("/workspaces/{workspace_id}/sections", response_model=s.SectionOutput, status_code=201)
def create_section(workspace_id: UUID, payload: s.SectionCreate, user: CurrentUser, db: Database):
    return committed(db, svc.create_section(db, user, workspace_id, payload), s.SectionOutput)


@router.put("/workspaces/{workspace_id}/sections/order", status_code=204)
def reorder_sections(workspace_id: UUID, payload: s.Reorder, user: CurrentUser, db: Database):
    """Donner l'ordre complet des sections de l'espace, archives incluses."""
    svc.reorder_sections(db, user, workspace_id, payload)
    db.commit()


@router.patch("/workspaces/{workspace_id}/sections/{section_id}", response_model=s.SectionOutput)
def patch_section(
    workspace_id: UUID, section_id: UUID, payload: s.SectionPatch, user: CurrentUser, db: Database
):
    return committed(
        db, svc.update_section(db, user, workspace_id, section_id, payload), s.SectionOutput
    )


@router.get("/workspaces/{workspace_id}/statuses", response_model=list[s.StatusOutput])
def statuses(workspace_id: UUID, user: CurrentUser, db: Database):
    return svc.list_statuses(db, user, workspace_id)


@router.post("/workspaces/{workspace_id}/statuses", response_model=s.StatusOutput, status_code=201)
def create_status(workspace_id: UUID, payload: s.StatusCreate, user: CurrentUser, db: Database):
    return committed(db, svc.create_status(db, user, workspace_id, payload), s.StatusOutput)


@router.put("/workspaces/{workspace_id}/statuses/order", status_code=204)
def reorder_statuses(workspace_id: UUID, payload: s.Reorder, user: CurrentUser, db: Database):
    svc.reorder_statuses(db, user, workspace_id, payload)
    db.commit()


@router.patch("/workspaces/{workspace_id}/statuses/{status_id}", response_model=s.StatusOutput)
def patch_status(
    workspace_id: UUID, status_id: UUID, payload: s.StatusPatch, user: CurrentUser, db: Database
):
    return committed(
        db, svc.update_status(db, user, workspace_id, status_id, payload), s.StatusOutput
    )


@router.delete("/workspaces/{workspace_id}/statuses/{status_id}", status_code=204)
def delete_status(
    workspace_id: UUID,
    status_id: UUID,
    user: CurrentUser,
    db: Database,
    replacement_id: UUID | None = None,
):
    """Retirer un statut ; réaffecter ses tâches à un statut du même type si utilisé."""
    svc.delete_status(db, user, workspace_id, status_id, replacement_id)
    db.commit()


@router.get("/workspaces/{workspace_id}/labels", response_model=list[s.LabelOutput])
def labels(workspace_id: UUID, user: CurrentUser, db: Database):
    return svc.list_labels(db, user, workspace_id)


@router.post("/workspaces/{workspace_id}/labels", response_model=s.LabelOutput, status_code=201)
def create_label(workspace_id: UUID, payload: s.LabelCreate, user: CurrentUser, db: Database):
    return committed(db, svc.create_label(db, user, workspace_id, payload), s.LabelOutput)


@router.put("/workspaces/{workspace_id}/labels/{label_id}", response_model=s.LabelOutput)
def update_label(
    workspace_id: UUID, label_id: UUID, payload: s.LabelCreate, user: CurrentUser, db: Database
):
    return committed(db, svc.update_label(db, user, workspace_id, label_id, payload), s.LabelOutput)


@router.delete("/workspaces/{workspace_id}/labels/{label_id}", status_code=204)
def delete_label(workspace_id: UUID, label_id: UUID, user: CurrentUser, db: Database):
    svc.delete_label(db, user, workspace_id, label_id)
    db.commit()


@router.get("/workspaces/{workspace_id}/view", response_model=s.ViewSettings)
def view(workspace_id: UUID, user: CurrentUser, db: Database):
    return svc.view_settings(db, user, workspace_id)


@router.put("/workspaces/{workspace_id}/view", response_model=s.ViewSettings)
def update_view(workspace_id: UUID, payload: s.ViewSettings, user: CurrentUser, db: Database):
    result = svc.save_view_settings(db, user, workspace_id, payload)
    db.commit()
    return result


@router.get("/tasks", response_model=s.TaskPage)
def tasks(
    user: CurrentUser,
    db: Database,
    workspace_id: UUID | None = None,
    section_id: UUID | None = None,
    status_id: UUID | None = None,
    priority: int | None = Query(None, ge=1, le=4),
    label_id: UUID | None = None,
    search: str = Query("", max_length=500),
    completed: bool | None = None,
    archived: bool = False,
    due: Literal["all", "overdue", "today", "upcoming", "none"] = "all",
    today: date | None = None,
    sort: Literal["manual", "priority", "due_date"] = "manual",
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    """Filtrer/paginer les tâches autorisées ; today permet d'utiliser la date locale du client."""
    return svc.list_tasks(
        db,
        user,
        workspace_id=workspace_id,
        section_id=section_id,
        status_id=status_id,
        priority=priority,
        label_id=label_id,
        search=search,
        completed=completed,
        archived=archived,
        due=due,
        today=today,
        sort=sort,
        offset=offset,
        limit=limit,
    )


@router.post("/tasks", response_model=s.TaskOutput, status_code=201)
def create_task(payload: s.TaskCreate, user: CurrentUser, db: Database):
    return committed_task(db, svc.create_task(db, user, payload))


@router.post(
    "/tasks/bulk",
    response_model=list[s.TaskOutput],
    responses={
        401: {"description": "Session requise."},
        403: {"description": "Origine ou jeton CSRF invalide."},
        404: {"description": "Tâche ou destination inaccessible."},
        409: {"description": "Version périmée ou élément archivé ; lot entièrement annulé."},
        422: {"description": "Lot ou calendrier invalide ; lot entièrement annulé."},
    },
)
def bulk_tasks(payload: s.BulkInput, user: CurrentUser, db: Database):
    """Appliquer un lot atomique de 1 à 500 tâches distinctes, dans l’ordre fourni.

    Chaque tâche exige sa version courante. 401 sans session, 403 sans CSRF/origine
    valide, 404 hors propriétaire ou destination inconnue, 409 si version périmée
    ou archive, 422 si lot/calendrier invalide. Toute erreur annule le lot entier.
    reschedule conserve règles et compteurs ; move conserve ouvert/terminé et dates
    de résolution, place en fin de section et reprend les étiquettes ; archive
    et restore préservent dates et historique. complete/reopen utilisent le cycle
    de vie individuel (une occurrence récurrente) ; duplicate retourne les copies.
    priority applique 1–4 ; status_ids et label_ids couvrent exactement les espaces
    représentés. labels ajoute/retire les étiquettes locales, sans dépasser 100.
    """
    result = svc.bulk_tasks(db, user, payload)
    db.commit()
    return result


@router.post(
    "/tasks/{task_id}/duplicate",
    response_model=s.TaskOutput,
    status_code=201,
    responses={
        401: {"description": "Session requise."},
        403: {"description": "Origine ou jeton CSRF invalide."},
        404: {"description": "Tâche inaccessible."},
        409: {"description": "Version périmée ou tâche/espace/section archivé."},
    },
)
def duplicate_task(task_id: UUID, payload: s.VersionInput, user: CurrentUser, db: Database):
    """Copier une tâche active dans son espace/section, en fin de liste.

    Version exigée ; mêmes accès et erreurs que les mutations individuelles.
    Copie du titre, description, priorité, étiquettes et calendrier. Nouveau cycle
    ouvert, nouvel UUID et dates de création, compteur nul et historique indépendant.
    """
    return committed_task(db, svc.duplicate_task(db, user, svc.task(db, user, task_id), payload))


@router.get("/tasks/{task_id}", response_model=s.TaskOutput)
def get_task(task_id: UUID, user: CurrentUser, db: Database):
    return svc.output(db, svc.task(db, user, task_id))


@router.patch("/tasks/{task_id}", response_model=s.TaskOutput)
def patch_task(task_id: UUID, payload: s.TaskPatch, user: CurrentUser, db: Database):
    """Éditer ou archiver/restaurer ; expected_version protège les éditions concurrentes."""
    return committed_task(db, svc.patch_task(db, user, svc.task(db, user, task_id), payload))


@router.post("/tasks/{task_id}/move", response_model=s.TaskOutput)
def move_task(task_id: UUID, payload: s.MoveInput, user: CurrentUser, db: Database):
    """Déplacer avant before_id, ou en fin d'espace. Copier les étiquettes nommées entre espaces."""
    return committed_task(db, svc.move_task(db, user, svc.task(db, user, task_id), payload))


@router.post("/tasks/{task_id}/complete", response_model=s.TaskOutput)
def complete_task(task_id: UUID, payload: s.VersionInput, user: CurrentUser, db: Database):
    return committed_task(
        db, svc.complete_task(db, user, svc.task(db, user, task_id), payload, True)
    )


@router.post("/tasks/{task_id}/reopen", response_model=s.TaskOutput)
def reopen_task(task_id: UUID, payload: s.VersionInput, user: CurrentUser, db: Database):
    return committed_task(
        db, svc.complete_task(db, user, svc.task(db, user, task_id), payload, False)
    )


@router.post("/tasks/{task_id}/undo-complete", response_model=s.TaskOutput)
def undo_complete(task_id: UUID, payload: s.VersionInput, user: CurrentUser, db: Database):
    """Annuler la dernière résolution sans effacer le journal, avant toute nouvelle modification.

    Restaure la date, le statut ouvert et le compteur précédents. L’événement compensateur
    référence la résolution annulée. Une version périmée ou un changement ultérieur donne 409.
    """
    return committed_task(db, svc.undo_complete(db, user, svc.task(db, user, task_id), payload))


@router.get("/tasks/{task_id}/events", response_model=s.EventPage)
def events(
    task_id: UUID,
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
):
    return svc.task_events(db, user, task_id, offset, limit)
