from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import delete, func, select

from life_app.core.database import Database
from life_app.features.auth.service import CurrentUser
from life_app.features.tasks import models as m
from life_app.features.tasks import schemas as s
from life_app.features.tasks import service as svc
from life_app.features.tasks.recurrence import Recurrence, dates, describe
from life_app.features.tasks.scheduling import parse_schedule

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

    Dates relatives à today, fuseau IANA pour les récurrences. Texte entre guillemets
    conservé. Une expression inconnue renvoie matched_text=null et le titre intact.
    """
    try:
        Recurrence.valid_timezone(payload.timezone)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return parse_schedule(payload.text, payload.today, payload.timezone)


@router.post("/scheduling/preview", response_model=s.SchedulePreviewOutput)
def preview_scheduling(payload: s.SchedulePreviewInput, user: CurrentUser):
    """Prévisualiser jusqu’à 12 dates sans écriture ; mêmes règles que la résolution.

    En mode completion, aperçu indicatif supposant chaque résolution à l’échéance.
    Les dates inexistantes sont sautées selon RFC 5545. Fin inclusive et exclusions.
    """
    rule = payload.recurrence
    after = payload.after or rule.start_date
    upcoming = dates(
        rule,
        after,
        inclusive=True,
        limit=payload.limit,
        completed=payload.completed,
        anchor=after if rule.mode == "completion" else None,
    )
    if not upcoming:
        raise HTTPException(
            422, "Aucune occurrence pour ces réglages. Vérifiez les jours et la fin."
        )
    return s.SchedulePreviewOutput(
        label=describe(rule),
        dates=upcoming,
        explanation="Dates indicatives : le délai repart de chaque résolution."
        if rule.mode == "completion"
        else "Calendrier fixe. Les dates inexistantes et exclues sont sautées.",
    )


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
    return db.scalars(
        select(m.Workspace)
        .where(
            m.Workspace.owner_id == user.id,
            m.Workspace.archived_at.is_not(None) if archived else m.Workspace.archived_at.is_(None),
        )
        .order_by(m.Workspace.position, m.Workspace.id)
    ).all()


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
    items = db.scalars(select(m.Workspace).where(m.Workspace.owner_id == user.id)).all()
    svc.reorder(db, items, payload.ids)
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
    svc.workspace(db, user, workspace_id)
    return db.scalars(
        select(m.Section)
        .where(
            m.Section.workspace_id == workspace_id,
            m.Section.archived_at.is_not(None) if archived else m.Section.archived_at.is_(None),
        )
        .order_by(m.Section.position, m.Section.id)
    ).all()


@router.post("/workspaces/{workspace_id}/sections", response_model=s.SectionOutput, status_code=201)
def create_section(workspace_id: UUID, payload: s.SectionCreate, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id, active=True)
    item = m.Section(
        workspace_id=workspace_id,
        **payload.model_dump(),
        position=svc.next_position(db, m.Section, m.Section.workspace_id == workspace_id),
    )
    db.add(item)
    return committed(db, item, s.SectionOutput)


@router.put("/workspaces/{workspace_id}/sections/order", status_code=204)
def reorder_sections(workspace_id: UUID, payload: s.Reorder, user: CurrentUser, db: Database):
    """Donner l'ordre complet des sections de l'espace, archives incluses."""
    svc.workspace(db, user, workspace_id, active=True)
    svc.reorder(
        db,
        db.scalars(select(m.Section).where(m.Section.workspace_id == workspace_id)).all(),
        payload.ids,
    )
    db.commit()


@router.patch("/workspaces/{workspace_id}/sections/{section_id}", response_model=s.SectionOutput)
def patch_section(
    workspace_id: UUID, section_id: UUID, payload: s.SectionPatch, user: CurrentUser, db: Database
):
    svc.workspace(db, user, workspace_id, active=True)
    item = svc.member(db, m.Section, section_id, workspace_id)
    svc.patch_entity(item, payload)
    return committed(db, item, s.SectionOutput)


@router.get("/workspaces/{workspace_id}/statuses", response_model=list[s.StatusOutput])
def statuses(workspace_id: UUID, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id)
    return db.scalars(
        select(m.Status)
        .where(m.Status.workspace_id == workspace_id)
        .order_by(m.Status.position, m.Status.id)
    ).all()


@router.post("/workspaces/{workspace_id}/statuses", response_model=s.StatusOutput, status_code=201)
def create_status(workspace_id: UUID, payload: s.StatusCreate, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id, active=True)
    item = m.Status(
        workspace_id=workspace_id,
        **payload.model_dump(),
        position=svc.next_position(db, m.Status, m.Status.workspace_id == workspace_id),
    )
    db.add(item)
    return committed(db, item, s.StatusOutput)


@router.put("/workspaces/{workspace_id}/statuses/order", status_code=204)
def reorder_statuses(workspace_id: UUID, payload: s.Reorder, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id, active=True)
    svc.reorder(
        db,
        db.scalars(select(m.Status).where(m.Status.workspace_id == workspace_id)).all(),
        payload.ids,
    )
    db.commit()


@router.patch("/workspaces/{workspace_id}/statuses/{status_id}", response_model=s.StatusOutput)
def patch_status(
    workspace_id: UUID, status_id: UUID, payload: s.StatusPatch, user: CurrentUser, db: Database
):
    svc.workspace(db, user, workspace_id, active=True)
    item = svc.member(db, m.Status, status_id, workspace_id)
    svc.patch_status(db, item, payload)
    return committed(db, item, s.StatusOutput)


@router.delete("/workspaces/{workspace_id}/statuses/{status_id}", status_code=204)
def delete_status(
    workspace_id: UUID,
    status_id: UUID,
    user: CurrentUser,
    db: Database,
    replacement_id: UUID | None = None,
):
    """Retirer un statut ; réaffecter ses tâches à un statut du même type si utilisé."""
    svc.workspace(db, user, workspace_id, active=True)
    svc.remove_status(db, svc.member(db, m.Status, status_id, workspace_id), replacement_id)
    db.commit()


@router.get("/workspaces/{workspace_id}/labels", response_model=list[s.LabelOutput])
def labels(workspace_id: UUID, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id)
    return db.scalars(
        select(m.Label)
        .where(m.Label.workspace_id == workspace_id)
        .order_by(m.Label.name, m.Label.id)
    ).all()


@router.post("/workspaces/{workspace_id}/labels", response_model=s.LabelOutput, status_code=201)
def create_label(workspace_id: UUID, payload: s.LabelCreate, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id, active=True)
    item = m.Label(workspace_id=workspace_id, **payload.model_dump())
    db.add(item)
    return committed(db, item, s.LabelOutput)


@router.put("/workspaces/{workspace_id}/labels/{label_id}", response_model=s.LabelOutput)
def update_label(
    workspace_id: UUID, label_id: UUID, payload: s.LabelCreate, user: CurrentUser, db: Database
):
    svc.workspace(db, user, workspace_id, active=True)
    item = svc.member(db, m.Label, label_id, workspace_id)
    svc.patch_entity(item, payload)
    return committed(db, item, s.LabelOutput)


@router.delete("/workspaces/{workspace_id}/labels/{label_id}", status_code=204)
def delete_label(workspace_id: UUID, label_id: UUID, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id, active=True)
    item = svc.member(db, m.Label, label_id, workspace_id)
    db.execute(delete(m.TaskLabel).where(m.TaskLabel.label_id == item.id))
    view = db.get(m.ViewPreference, workspace_id)
    if view and view.settings.get("label_id") == str(item.id):
        view.settings = {**view.settings, "label_id": None}
    db.delete(item)
    db.commit()


@router.get("/workspaces/{workspace_id}/view", response_model=s.ViewSettings)
def view(workspace_id: UUID, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id)
    item = db.get(m.ViewPreference, workspace_id)
    return s.ViewSettings.model_validate(item.settings if item else {})


@router.put("/workspaces/{workspace_id}/view", response_model=s.ViewSettings)
def update_view(workspace_id: UUID, payload: s.ViewSettings, user: CurrentUser, db: Database):
    svc.workspace(db, user, workspace_id)
    if payload.status_id:
        svc.member(db, m.Status, payload.status_id, workspace_id)
    if payload.label_id:
        svc.member(db, m.Label, payload.label_id, workspace_id)
    item = db.get(m.ViewPreference, workspace_id)
    if item is None:
        item = m.ViewPreference(workspace_id=workspace_id)
        db.add(item)
    item.settings = payload.model_dump(mode="json")
    db.commit()
    return payload


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
    svc.task(db, user, task_id)
    query = select(m.TaskEvent).where(m.TaskEvent.task_id == task_id)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = db.scalars(
        query.order_by(m.TaskEvent.occurred_at, m.TaskEvent.id).offset(offset).limit(limit)
    ).all()
    return s.EventPage(
        items=[s.EventOutput.model_validate(item) for item in items],
        total=total,
        offset=offset,
        limit=limit,
    )
