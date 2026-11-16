"""Application-owned activity facts and sixty localized quests."""

from sqlalchemy import select

from life_app.apps.tracking import models as m
from life_app.platform.progression.definition import DAYS, STREAKS, VOLUME, Activity, quest_ladder
from life_app.platform.progression.service import record


class TrackingProgression:
    rules = (
        (
            "20 XP par période confirmée, plus 0 à 20 XP selon les objectifs. La première "
            "confirmation fixe les points ; les corrections ne les multiplient pas."
        ),
        (
            "20 XP per confirmed period, plus 0 to 20 XP for goals. The first confirmation "
            "fixes the points; corrections do not multiply them."
        ),
    )
    base_xp = 20
    titles = (
        ("Observateur", "Observer"),
        ("Explorateur", "Explorer"),
        ("Régulier", "Steady hand"),
        ("Artisan des habitudes", "Habit builder"),
        ("Pilote", "Navigator"),
        ("Équilibriste", "Balance keeper"),
        ("Inspirateur", "Inspiration"),
        ("Maître des habitudes", "Habit master"),
        ("Guide", "Guide"),
        ("Légende du quotidien", "Everyday legend"),
    )
    quests = (
        *quest_ladder(
            "completed",
            VOLUME,
            ("Prendre un moment", "Take a moment"),
            (
                "Confirmer {target} périodes de suivi distinctes.",
                "Confirm {target} distinct tracking periods.",
            ),
            "practice",
        ),
        *quest_ladder(
            "perfect",
            VOLUME,
            ("Les objectifs alignés", "Goals aligned"),
            (
                "Confirmer {target} périodes avec un score de 10/10.",
                "Confirm {target} periods with a 10/10 score.",
            ),
            "mastery",
        ),
        *quest_ladder(
            "goals",
            VOLUME,
            ("Viser juste", "On target"),
            (
                "Atteindre {target} objectifs dans les premières confirmations.",
                "Meet {target} goals in first confirmations.",
            ),
            "mastery",
        ),
        *quest_ladder(
            "trackers",
            (1, 2, 3, 4, 5, 7, 10, 15, 20, 30),
            ("Facettes du quotidien", "Facets of everyday life"),
            (
                "Confirmer une période dans {target} suivis différents.",
                "Confirm a period in {target} different trackers.",
            ),
            "exploration",
        ),
        *quest_ladder(
            "active_days",
            DAYS,
            ("À l’écoute de soi", "Check in with yourself"),
            (
                "Confirmer des suivis sur {target} jours distincts.",
                "Confirm trackers on {target} distinct days.",
            ),
            "consistency",
        ),
        *quest_ladder(
            "streak",
            STREAKS,
            ("Une habitude qui dure", "A lasting habit"),
            (
                "Atteindre une série de {target} jours éligibles dans Suivi.",
                "Reach a streak of {target} eligible days in Tracking.",
            ),
            "streak",
        ),
    )

    def activity(self, entry, *, historical=False):
        from life_app.apps.tracking.schemas import TrackerInput
        from life_app.apps.tracking.service import due_fields, entry_output, field_score

        if entry.status != "complete":
            return None
        result = entry_output(entry)
        definition = TrackerInput.model_validate(entry.definition)
        goals = sum(
            1
            for field in due_fields(definition, entry.period_start)
            if field.goal
            and entry.values.get(field.id) is not None
            and field_score(field, entry.values[field.id]) == 1
        )
        return Activity(
            f"entry:{entry.id}",
            entry.completed_at,
            result.xp if historical else 20 + round(2 * (result.score or 0)),
            {"completed": 1, "perfect": int(result.score == 10), "goals": goals},
            {"trackers": [str(entry.tracker_id)]},
        )

    def history(self, db, user):
        query = (
            select(m.Entry)
            .where(m.Entry.owner_id == user.id, m.Entry.status == "complete")
            .order_by(m.Entry.completed_at, m.Entry.id)
            .execution_options(yield_per=500)
        )
        for entry in db.scalars(query):
            yield self.activity(entry, historical=True)


def record_completion(db, user, entry):
    record(db, user, "tracking", provider, provider.activity(entry))


provider = TrackingProgression()
