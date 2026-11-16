"""OKR facts own their meaning; common progression owns rewards and streaks."""

from sqlalchemy import Integer, select

from life_app.apps.okr.models import Event
from life_app.platform.progression.definition import DAYS, STREAKS, Activity, quest_ladder

MILESTONES = (1, 3, 5, 10, 20, 30, 50, 75, 100, 200)


class OkrProgression:
    base_xp = 100
    rules = (
        (
            "100 XP par objectif accompli et 15 XP par résultat clé atteint, une "
            "seule fois par identifiant. Les corrections, réouvertures et "
            "archives conservent les gains sans les multiplier."
        ),
        (
            "100 XP per completed objective and 15 XP per key result reached, "
            "once per identifier. Corrections, reopening and archives preserve "
            "rewards without multiplying them."
        ),
    )
    titles = (
        ("Rêveur", "Dreamer"),
        ("Éclaireur", "Pathfinder"),
        ("Bâtisseur", "Builder"),
        ("Stratège", "Strategist"),
        ("Conquérant", "Achiever"),
        ("Visionnaire", "Visionary"),
        ("Inspirateur", "Inspiration"),
        ("Architecte du futur", "Future architect"),
        ("Guide des possibles", "Possibility guide"),
        ("Légende des objectifs", "Goal legend"),
    )
    quests = (
        *quest_ladder(
            "completed",
            MILESTONES,
            ("Du rêve au réel", "Dreams into reality"),
            ("Accomplir {target} objectifs distincts.", "Complete {target} distinct objectives."),
            "practice",
        ),
        *quest_ladder(
            "key_results",
            (1, 5, 10, 20, 40, 60, 100, 150, 250, 500),
            ("Preuves de progrès", "Proof of progress"),
            (
                "Atteindre {target} résultats clés distincts.",
                "Reach {target} distinct key results.",
            ),
            "mastery",
        ),
        *quest_ladder(
            "personal",
            MILESTONES,
            ("Une vie choisie", "A life of your choosing"),
            ("Accomplir {target} objectifs personnels.", "Complete {target} personal objectives."),
            "exploration",
        ),
        *quest_ladder(
            "professional",
            MILESTONES,
            ("L’impact au travail", "Make an impact"),
            (
                "Accomplir {target} objectifs professionnels.",
                "Complete {target} professional objectives.",
            ),
            "exploration",
        ),
        *quest_ladder(
            "active_days",
            DAYS,
            ("Un pas après l’autre", "One step at a time"),
            (
                "Atteindre un résultat clé ou un objectif sur {target} jours distincts.",
                "Reach a key result or an objective on {target} distinct days.",
            ),
            "consistency",
        ),
        *quest_ladder(
            "streak",
            STREAKS,
            ("Garder le cap", "Stay the course"),
            (
                "Atteindre une série de {target} jours éligibles dans OKR.",
                "Reach a streak of {target} eligible days in OKR.",
            ),
            "streak",
        ),
    )

    def activity(self, event):
        if event.kind == "completed":
            return Activity(
                f"objective:{event.objective_id}",
                event.occurred_at,
                100,
                {"completed": 1, event.snapshot["domain"]: 1},
                {},
            )
        if event.kind == "key_result_reached":
            return Activity(
                f"result:{event.objective_id}:{event.detail['key_result_id']}",
                event.occurred_at,
                15,
                {"key_results": 1},
                {},
            )
        return None

    def history(self, db, user):
        for event in db.scalars(
            select(Event)
            .where(Event.owner_id == user.id, Event.kind.in_(["completed", "key_result_reached"]))
            .order_by(Event.occurred_at, Event.snapshot["version"].astext.cast(Integer), Event.id)
            .execution_options(yield_per=500)
        ):
            yield self.activity(event)


provider = OkrProgression()
