"""Ownership, ordering and atomic task transitions. Routes own the final commit."""

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select

from life_app.core.database import utcnow
from life_app.features.tasks import models as m
from life_app.features.tasks import schemas as s


def workspace(db, user, workspace_id, *, active=False):
    item = db.scalar(
        select(m.Workspace).where(m.Workspace.id == workspace_id, m.Workspace.owner_id == user.id)
    )
    if item is None:
        raise HTTPException(404, "Espace introuvable.")
    if active and item.archived_at:
        raise HTTPException(409, "Restaurez cet espace avant de le modifier.")
    return item


def member(db, model, item_id, workspace_id):
    item = db.scalar(select(model).where(model.id == item_id, model.workspace_id == workspace_id))
    if item is None:
        raise HTTPException(404, "Élément introuvable dans cet espace.")
    return item


def task(db, user, task_id):
    item = db.scalar(
        select(m.Task)
        .join(m.Workspace)
        .where(m.Task.id == task_id, m.Workspace.owner_id == user.id)
    )
    if item is None:
        raise HTTPException(404, "Tâche introuvable.")
    return item


def next_position(db, model, condition):
    return (db.scalar(select(func.max(model.position)).where(condition)) or 0) + 1


def reorder(db, items, ids):
    if len(set(ids)) != len(ids) or set(ids) != {item.id for item in items}:
        raise HTTPException(409, "L'ordre doit contenir chaque élément exactement une fois.")
    by_id = {item.id: item for item in items}
    for position, item_id in enumerate(ids):
        by_id[item_id].position = position


def patch_entity(item, payload):
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "archived":
            if bool(item.archived_at) != value:
                item.archived_at = utcnow() if value else None
        else:
            setattr(item, field, value)


def create_workspace(db, user, payload):
    if payload.parent_id is not None:
        workspace(db, user, payload.parent_id, active=True)
    item = m.Workspace(
        owner_id=user.id,
        **payload.model_dump(),
        position=next_position(db, m.Workspace, m.Workspace.owner_id == user.id),
    )
    db.add(item)
    db.flush()
    for position, (name, color, complete) in enumerate(
        [
            ("À faire", "#8b929c", False),
            ("En cours", "#c79238", False),
            ("Terminé", "#4d9470", True),
        ]
    ):
        db.add(
            m.Status(
                workspace_id=item.id,
                name=name,
                color=color,
                position=position,
                is_completed=complete,
            )
        )
    db.add(
        m.ViewPreference(workspace_id=item.id, settings=s.ViewSettings().model_dump(mode="json"))
    )
    return item


def patch_workspace(db, user, item, payload):
    """Validate the tree under the existing owner mutation lock, then apply atomically."""
    fields = payload.model_fields_set
    parent_id = payload.parent_id if "parent_id" in fields else item.parent_id
    if parent_id is not None and ("parent_id" in fields or payload.archived is False):
        parent = workspace(db, user, parent_id, active=True)
        visited = {item.id}
        while parent is not None:
            if parent.id in visited:
                raise HTTPException(409, "Un espace ne peut pas être son propre ancêtre.")
            visited.add(parent.id)
            parent = workspace(db, user, parent.parent_id) if parent.parent_id else None
    if payload.archived is True and db.scalar(
        select(m.Workspace.id)
        .where(m.Workspace.parent_id == item.id, m.Workspace.archived_at.is_(None))
        .limit(1)
    ):
        raise HTTPException(409, "Archivez ou déplacez d’abord les sous-espaces actifs.")
    patch_entity(item, payload)


def ensure_status_groups(db, workspace_id, excluded_id=None, changed=None):
    statuses = db.scalars(select(m.Status).where(m.Status.workspace_id == workspace_id)).all()
    groups = {
        changed if changed is not None and item.id == excluded_id else item.is_completed
        for item in statuses
        if item.id != excluded_id or changed is not None
    }
    if groups != {True, False}:
        raise HTTPException(409, "Conservez au moins un statut ouvert et un statut terminé.")


def patch_status(db, item, payload):
    if payload.is_completed is not None and payload.is_completed != item.is_completed:
        if db.scalar(select(m.Task.id).where(m.Task.status_id == item.id).limit(1)):
            raise HTTPException(
                409, "Ce statut est utilisé. Créez un statut et déplacez les tâches."
            )
        ensure_status_groups(db, item.workspace_id, item.id, payload.is_completed)
    patch_entity(item, payload)


def remove_status(db, item, replacement_id):
    ensure_status_groups(db, item.workspace_id, item.id)
    tasks = db.scalars(select(m.Task).where(m.Task.status_id == item.id)).all()
    replacement = None
    if replacement_id:
        replacement = member(db, m.Status, replacement_id, item.workspace_id)
        if replacement.id == item.id or replacement.is_completed != item.is_completed:
            raise HTTPException(409, "Choisissez un autre statut du même type ouvert/terminé.")
    if tasks and replacement is None:
        raise HTTPException(409, "Un statut de remplacement est nécessaire.")
    for current in tasks:
        previous = context(db, current)
        current.status_id = replacement.id
        touch(current)
        event(db, current, "moved", previous)
    db.flush()
    view = db.get(m.ViewPreference, item.workspace_id)
    if view and view.settings.get("status_id") == str(item.id):
        view.settings = {**view.settings, "status_id": None}
    db.delete(item)


def validate_destination(db, user, workspace_id, section_id, status_id):
    workspace(db, user, workspace_id, active=True)
    if section_id:
        section = member(db, m.Section, section_id, workspace_id)
        if section.archived_at:
            raise HTTPException(409, "Restaurez la section de destination.")
    return member(db, m.Status, status_id, workspace_id)


def validate_labels(db, workspace_id, label_ids):
    if len(label_ids) != len(set(label_ids)):
        raise HTTPException(422, "Une étiquette ne peut être répétée.")
    labels = db.scalars(
        select(m.Label).where(m.Label.workspace_id == workspace_id, m.Label.id.in_(label_ids))
    ).all()
    if len(labels) != len(label_ids):
        raise HTTPException(404, "Étiquette introuvable dans cet espace.")
    return labels


def replace_labels(db, item, label_ids):
    validate_labels(db, item.workspace_id, label_ids)
    db.execute(delete(m.TaskLabel).where(m.TaskLabel.task_id == item.id))
    db.add_all(
        [
            m.TaskLabel(task_id=item.id, label_id=label_id, workspace_id=item.workspace_id)
            for label_id in label_ids
        ]
    )


def outputs(db, items):
    labels = {}
    if items:
        for task_id, label_id in db.execute(
            select(m.TaskLabel.task_id, m.TaskLabel.label_id).where(
                m.TaskLabel.task_id.in_([x.id for x in items])
            )
        ):
            labels.setdefault(task_id, []).append(label_id)
    return [
        s.TaskOutput.model_validate(item).model_copy(
            update={"label_ids": sorted(labels.get(item.id, []), key=str)}
        )
        for item in items
    ]


def output(db, item):
    db.flush()
    return outputs(db, [item])[0]


def context(db, item):
    space = db.get(m.Workspace, item.workspace_id)
    section = db.get(m.Section, item.section_id) if item.section_id else None
    status = db.get(m.Status, item.status_id)
    return {
        "workspace_id": str(space.id),
        "workspace_name": space.name,
        "section_id": str(section.id) if section else None,
        "section_name": section.name if section else None,
        "status_id": str(status.id),
        "status_name": status.name,
        "is_completed": status.is_completed,
    }


def event(db, item, kind, previous=None):
    current = context(db, item)
    db.add(
        m.TaskEvent(
            task_id=item.id,
            workspace_id=item.workspace_id,
            section_id=item.section_id,
            status_id=item.status_id,
            previous_status_id=previous["status_id"] if previous else None,
            kind=kind,
            was_completed=previous["is_completed"] if previous else False,
            is_completed=current["is_completed"],
            context={"before": previous, "after": current},
        )
    )


def touch(item):
    item.version += 1
    item.updated_at = utcnow()


def check_version(item, expected_version):
    if item.version != expected_version:
        raise HTTPException(409, "Cette tâche a changé. Rechargez-la avant de réessayer.")


def check_active(db, user, item, *, restoring=False):
    workspace(db, user, item.workspace_id, active=True)
    if item.section_id and db.get(m.Section, item.section_id).archived_at:
        raise HTTPException(409, "Restaurez la section avant de modifier cette tâche.")
    if item.archived_at and not restoring:
        raise HTTPException(409, "Restaurez la tâche avant de la modifier.")


def transition(db, item, target, previous):
    was_completed = previous["is_completed"]
    item.status_id = target.id
    if target.is_completed != was_completed:
        item.completed_at = utcnow() if target.is_completed else None
        event(db, item, "completed" if target.is_completed else "reopened", previous)


def create_task(db, user, payload):
    workspace(db, user, payload.workspace_id, active=True)
    status_id = payload.status_id
    if status_id is None:
        status_id = db.scalar(
            select(m.Status.id)
            .where(m.Status.workspace_id == payload.workspace_id, m.Status.is_completed.is_(False))
            .order_by(m.Status.position, m.Status.id)
            .limit(1)
        )
    target = validate_destination(db, user, payload.workspace_id, payload.section_id, status_id)
    validate_labels(db, payload.workspace_id, payload.label_ids)
    item = m.Task(
        **payload.model_dump(exclude={"label_ids", "status_id"}),
        status_id=target.id,
        position=next_position(db, m.Task, m.Task.workspace_id == payload.workspace_id),
        completed_at=utcnow() if target.is_completed else None,
    )
    db.add(item)
    db.flush()
    replace_labels(db, item, payload.label_ids)
    event(db, item, "created")
    if target.is_completed:
        event(db, item, "completed")
    return item


def patch_task(db, user, item, payload):
    check_version(item, payload.expected_version)
    values = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
    restoring = set(values) == {"archived"} and values["archived"] is False
    check_active(db, user, item, restoring=restoring)
    previous = context(db, item)
    section_id = values.pop("section_id", item.section_id)
    status_id = values.pop("status_id", item.status_id)
    destination = validate_destination(db, user, item.workspace_id, section_id, status_id)
    item.section_id = section_id
    transition(db, item, destination, previous)
    kind = (
        "moved"
        if previous["section_id"] != (str(section_id) if section_id else None)
        or previous["status_id"] != str(status_id)
        else "updated"
    )
    if "label_ids" in values:
        replace_labels(db, item, values.pop("label_ids"))
    if "archived" in values:
        archived = values.pop("archived")
        if bool(item.archived_at) != archived:
            item.archived_at = utcnow() if archived else None
            kind = "archived" if archived else "restored"
    for field, value in values.items():
        setattr(item, field, value)
    touch(item)
    event(db, item, kind, previous)
    return item


def complete_task(db, user, item, payload, completed):
    check_version(item, payload.expected_version)
    check_active(db, user, item)
    previous = context(db, item)
    if previous["is_completed"] == completed:
        return item
    target = db.scalar(
        select(m.Status)
        .where(m.Status.workspace_id == item.workspace_id, m.Status.is_completed == completed)
        .order_by(m.Status.position, m.Status.id)
        .limit(1)
    )
    if target is None:
        raise HTTPException(409, "Aucun statut compatible.")
    touch(item)
    transition(db, item, target, previous)
    return item


def move_task(db, user, item, payload):
    check_version(item, payload.expected_version)
    check_active(db, user, item)
    target = validate_destination(
        db, user, payload.workspace_id, payload.section_id, payload.status_id
    )
    if payload.before_id == item.id:
        raise HTTPException(422, "Une tâche ne peut pas être placée avant elle-même.")
    before = task(db, user, payload.before_id) if payload.before_id else None
    if before and (
        before.workspace_id != payload.workspace_id
        or before.section_id != payload.section_id
        or before.archived_at
    ):
        raise HTTPException(409, "La position cible doit appartenir à la section de destination.")
    previous = context(db, item)
    if item.workspace_id != payload.workspace_id:
        old_labels = db.scalars(
            select(m.Label)
            .join(m.TaskLabel, m.TaskLabel.label_id == m.Label.id)
            .where(m.TaskLabel.task_id == item.id)
        ).all()
        db.execute(delete(m.TaskLabel).where(m.TaskLabel.task_id == item.id))
        destination_labels = []
        for label in old_labels:
            destination = db.scalar(
                select(m.Label).where(
                    m.Label.workspace_id == payload.workspace_id, m.Label.name == label.name
                )
            )
            if destination is None:
                destination = m.Label(
                    workspace_id=payload.workspace_id, name=label.name, color=label.color
                )
                db.add(destination)
                db.flush()
            destination_labels.append(destination.id)
    else:
        destination_labels = None
    item.workspace_id = payload.workspace_id
    item.section_id = payload.section_id
    # All three foreign keys change in one UPDATE, never via an intermediate invalid state.
    item.status_id = target.id
    db.flush()
    if destination_labels is not None:
        replace_labels(db, item, destination_labels)
    ordered = db.scalars(
        select(m.Task)
        .where(m.Task.workspace_id == item.workspace_id, m.Task.id != item.id)
        .order_by(m.Task.position, m.Task.id)
    ).all()
    index = next(
        (i for i, other in enumerate(ordered) if other.id == payload.before_id), len(ordered)
    )
    ordered.insert(index, item)
    for position, other in enumerate(ordered):
        if other.position != position:
            other.position = position
            if other.id != item.id:
                touch(other)
    touch(item)
    transition(db, item, target, previous)
    event(db, item, "moved", previous)
    return item


def list_tasks(
    db,
    user,
    *,
    workspace_id=None,
    section_id=None,
    status_id=None,
    priority=None,
    label_id=None,
    search="",
    completed=None,
    archived=False,
    due="all",
    today=None,
    due_start=None,
    due_end=None,
    include_overdue=False,
    sort="manual",
    offset=0,
    limit=100,
):
    query = (
        select(m.Task)
        .join(m.Workspace)
        .outerjoin(m.Section, m.Section.id == m.Task.section_id)
        .where(m.Workspace.owner_id == user.id)
    )
    effective_archive = or_(
        m.Task.archived_at.is_not(None),
        m.Workspace.archived_at.is_not(None),
        m.Section.archived_at.is_not(None),
    )
    query = query.where(effective_archive if archived else ~effective_archive)
    for field, value in [
        (m.Task.workspace_id, workspace_id),
        (m.Task.section_id, section_id),
        (m.Task.status_id, status_id),
        (m.Task.priority, priority),
    ]:
        if value is not None:
            query = query.where(field == value)
    if label_id:
        query = query.where(
            m.Task.id.in_(select(m.TaskLabel.task_id).where(m.TaskLabel.label_id == label_id))
        )
    if search:
        query = query.where(
            or_(
                m.Task.title.icontains(search, autoescape=True),
                m.Task.description.icontains(search, autoescape=True),
            )
        )
    if completed is not None:
        query = query.where(
            m.Task.completed_at.is_not(None) if completed else m.Task.completed_at.is_(None)
        )
    today = today or date.today()
    if due_start is not None and due_end is not None:
        period = m.Task.due_date.between(due_start, due_end)
        if include_overdue:
            period = or_(period, (m.Task.due_date < today) & m.Task.completed_at.is_(None))
        query = query.where(period)
    if due == "overdue":
        query = query.where(m.Task.due_date < today, m.Task.completed_at.is_(None))
    elif due == "today":
        query = query.where(m.Task.due_date == today)
    elif due == "upcoming":
        query = query.where(m.Task.due_date > today)
    elif due == "none":
        query = query.where(m.Task.due_date.is_(None))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    order = {
        "manual": m.Task.position,
        "priority": m.Task.priority,
        "due_date": m.Task.due_date.asc().nulls_last(),
    }[sort]
    items = db.scalars(
        query.order_by(order, m.Task.position, m.Task.id).offset(offset).limit(limit)
    ).all()
    return s.TaskPage(items=outputs(db, items), total=total, offset=offset, limit=limit)


def agenda_settings(db, user):
    item = db.get(m.AgendaPreference, user.id)
    return s.AgendaSettings.model_validate(item.settings if item else {})


def save_agenda_settings(db, user, payload):
    item = db.get(m.AgendaPreference, user.id)
    if item is None:
        item = m.AgendaPreference(user_id=user.id)
        db.add(item)
    item.settings = payload.model_dump(mode="json")


def agenda_tasks(db, user, today, offset, limit):
    settings = agenda_settings(db, user)
    days = settings.custom_days if settings.period == "custom" else 7
    try:
        start = today + timedelta(days=1 if settings.period == "tomorrow" else 0)
        end = start + timedelta(days=days - 1 if settings.period in {"week", "custom"} else 0)
    except OverflowError as error:
        raise HTTPException(
            422, "La période dépasse les dates calendaires prises en charge."
        ) from error
    page = list_tasks(
        db,
        user,
        today=today,
        due_start=start,
        due_end=end,
        include_overdue=settings.include_overdue,
        completed=None if settings.show_completed else False,
        sort="due_date",
        offset=offset,
        limit=limit,
    )
    return s.AgendaPage(**page.model_dump(), today=today, start_date=start, end_date=end)
