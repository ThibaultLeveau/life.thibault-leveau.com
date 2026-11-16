"""Application-owned activity facts and sixty localized quests."""

from sqlalchemy import select

from life_app.apps.tasks import models as m
from life_app.platform.progression.definition import DAYS, STREAKS, VOLUME, Activity, quest_ladder
from life_app.platform.progression.service import record


class TasksProgression:
    rules = (
        (
            "10 XP par tâche terminée, une fois par tâche ou occurrence récurrente. "
            "Réouvrir puis terminer à nouveau ne redonne pas de points."
        ),
        (
            "10 XP per completed task, once per task or recurring occurrence. Reopening and "
            "completing again does not award more points."
        ),
    )
    base_xp = 10
    titles = (
        ("Éclaireur", "Pathfinder"),
        ("Organisateur", "Organizer"),
        ("Bâtisseur", "Builder"),
        ("Stratège", "Strategist"),
        ("Capitaine", "Captain"),
        ("Architecte", "Architect"),
        ("Visionnaire", "Visionary"),
        ("Maître du temps", "Time master"),
        ("Virtuose", "Virtuoso"),
        ("Légende des projets", "Project legend"),
    )
    quests = (
        *quest_ladder(
            "completed",
            VOLUME,
            ("Un pas de plus", "One step further"),
            (
                "Terminer {target} tâches ou occurrences distinctes.",
                "Complete {target} distinct tasks or occurrences.",
            ),
            "practice",
        ),
        *quest_ladder(
            "on_time",
            VOLUME,
            ("Dans les temps", "Right on time"),
            (
                "Terminer {target} tâches avant ou le jour de leur échéance.",
                "Complete {target} tasks on or before their due date.",
            ),
            "mastery",
        ),
        *quest_ladder(
            "recurring",
            VOLUME,
            ("Le sens du rythme", "Finding a rhythm"),
            (
                "Terminer {target} occurrences de tâches récurrentes.",
                "Complete {target} recurring task occurrences.",
            ),
            "mastery",
        ),
        *quest_ladder(
            "priority",
            VOLUME,
            ("L’essentiel d’abord", "First things first"),
            (
                "Terminer {target} tâches de priorité 1 ou 2.",
                "Complete {target} priority 1 or 2 tasks.",
            ),
            "mastery",
        ),
        *quest_ladder(
            "active_days",
            DAYS,
            ("Présent au rendez-vous", "Showing up"),
            (
                "Utiliser Tâches sur {target} jours distincts.",
                "Use Tasks on {target} distinct days.",
            ),
            "consistency",
        ),
        *quest_ladder(
            "streak",
            STREAKS,
            ("Garder le fil", "Keep the thread"),
            (
                "Atteindre une série de {target} jours éligibles dans Tâches.",
                "Reach a streak of {target} eligible days in Tasks.",
            ),
            "streak",
        ),
    )

    def activity(self, event, timezone):
        from datetime import date
        from zoneinfo import ZoneInfo

        after = event.context.get("after") or {}
        due = after.get("due_date")
        recurring = bool(after.get("recurrence"))
        key = f"task:{event.task_id}:" + (due if recurring and due else "once")
        on_time = bool(
            due
            and event.occurred_at.astimezone(ZoneInfo(timezone)).date() <= date.fromisoformat(due)
        )
        priority = after.get("priority")
        return Activity(
            key,
            event.occurred_at,
            10,
            {
                "completed": 1,
                "on_time": int(on_time),
                "recurring": int(recurring),
                "priority": int(priority is not None and priority <= 2),
            },
            {},
        )

    def history(self, db, user):
        from sqlalchemy import String, cast

        from life_app.platform.progression.service import settings

        undone = select(m.TaskEvent.context["completion_event_id"].astext).where(
            m.TaskEvent.kind == "completion_undone",
            m.TaskEvent.context["completion_event_id"].astext.is_not(None),
        )
        query = (
            select(m.TaskEvent)
            .join(m.Workspace, m.Workspace.id == m.TaskEvent.workspace_id)
            .where(
                m.Workspace.owner_id == user.id,
                m.TaskEvent.kind == "completed",
                cast(m.TaskEvent.id, String).not_in(undone),
            )
            .order_by(m.TaskEvent.occurred_at, m.TaskEvent.id)
            .execution_options(yield_per=500)
        )
        timezone = settings(db, user).timezone
        for event in db.scalars(query):
            yield self.activity(event, timezone)


def record_completion(db, item, event):
    from life_app.platform.auth.models import User
    from life_app.platform.progression.service import settings

    user = db.get(User, db.get(m.Workspace, item.workspace_id).owner_id)
    db.flush()
    record(db, user, "tasks", provider, provider.activity(event, settings(db, user).timezone))


provider = TasksProgression()
