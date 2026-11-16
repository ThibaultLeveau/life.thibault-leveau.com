"""Application-owned activity facts and sixty localized quests."""

from sqlalchemy import select

from life_app.apps.sport import models as m
from life_app.platform.progression.definition import DAYS, STREAKS, VOLUME, Activity, quest_ladder
from life_app.platform.progression.service import record


class SportProgression:
    rules = (
        (
            "60 XP par séance terminée, puis 5 XP par série effectuée (bonus de 100 XP "
            "maximum). Une séance vide ou annulée ne rapporte pas de points."
        ),
        (
            "60 XP per completed session, plus 5 XP per performed set (up to 100 bonus XP). "
            "Empty or cancelled sessions award no points."
        ),
    )
    base_xp = 60
    titles = (
        ("En mouvement", "In motion"),
        ("Athlète", "Athlete"),
        ("Endurant", "Endurance builder"),
        ("Compétiteur", "Competitor"),
        ("Champion", "Champion"),
        ("Force tranquille", "Quiet strength"),
        ("Élite", "Elite"),
        ("Maître du mouvement", "Movement master"),
        ("Inarrêtable", "Unstoppable"),
        ("Légende du sport", "Sport legend"),
    )
    quests = (
        *quest_ladder(
            "completed",
            (1, 3, 5, 10, 25, 50, 100, 200, 350, 500),
            ("Une séance à la fois", "One session at a time"),
            (
                "Terminer {target} séances avec au moins une série effectuée.",
                "Complete {target} sessions with at least one performed set.",
            ),
            "practice",
        ),
        *quest_ladder(
            "sets",
            VOLUME,
            ("La force du geste", "Every set counts"),
            (
                "Effectuer {target} séries dans des séances terminées.",
                "Perform {target} sets in completed sessions.",
            ),
            "practice",
        ),
        *quest_ladder(
            "exercises",
            (1, 2, 3, 5, 8, 12, 20, 30, 50, 75),
            ("Palette de mouvements", "Movement repertoire"),
            (
                "Pratiquer {target} exercices différents dans des séances terminées.",
                "Practise {target} different exercises in completed sessions.",
            ),
            "exploration",
        ),
        *quest_ladder(
            "programs",
            (1, 2, 3, 4, 5, 7, 10, 15, 20, 30),
            ("Changer de terrain", "Explore your training"),
            (
                "Terminer des séances de {target} programmes différents.",
                "Complete sessions from {target} different programs.",
            ),
            "exploration",
        ),
        *quest_ladder(
            "active_days",
            DAYS,
            ("Le rendez-vous sportif", "Show up for yourself"),
            (
                "Pratiquer Sport sur {target} jours distincts.",
                "Practise Sport on {target} distinct days.",
            ),
            "consistency",
        ),
        *quest_ladder(
            "streak",
            STREAKS,
            ("Dans l’élan", "Keep moving"),
            (
                "Atteindre une série de {target} jours éligibles dans Sport.",
                "Reach a streak of {target} eligible days in Sport.",
            ),
            "streak",
        ),
    )

    def activity(self, session):
        sets = [
            s
            for s in session.sets
            if not s.get("skipped", False)
            and any(value > 0 for value in s.get("values", {}).values())
        ]
        if session.status != "completed" or not sets:
            return None
        exercises = {session.entries[s["entry_index"]]["exercise_id"] for s in sets}
        return Activity(
            f"session:{session.id}",
            session.finished_at,
            60 + min(100, len(sets) * 5),
            {"completed": 1, "sets": len(sets)},
            {"exercises": sorted(exercises), "programs": [str(session.workout_id)]},
        )

    def history(self, db, user):
        query = (
            select(m.Training)
            .where(m.Training.owner_id == user.id, m.Training.status == "completed")
            .order_by(m.Training.finished_at, m.Training.id)
            .execution_options(yield_per=500)
        )
        for session in db.scalars(query):
            activity = self.activity(session)
            if activity:
                yield activity


def record_completion(db, user, item):
    record(db, user, "sport", provider, provider.activity(item))


provider = SportProgression()
