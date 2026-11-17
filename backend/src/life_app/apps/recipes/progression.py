from sqlalchemy import select

from life_app.apps.recipes.models import Event
from life_app.platform.progression.definition import DAYS, STREAKS, Activity, quest_ladder

MILESTONES = (1, 3, 5, 10, 20, 30, 50, 75, 100, 200)
REWARDS = {
    "recipe_created": (25, "recipes"),
    "completed": (50, "lists"),
    "recipe_imported": (5, "imports"),
    "template_ready": (15, "templates"),
}


class RecipesProgression:
    base_xp = 50
    rules = (
        "25 XP par recette, 50 XP par liste terminée, 5 XP par recette importée dans une liste "
        "et 15 XP par modèle non vide. Une seule récompense par identifiant (ou couple "
        "liste/recette). Modifier, recocher ou rouvrir ne multiplie pas les gains.",
        "25 XP per recipe, 50 XP per completed list, 5 XP per recipe imported into a list "
        "and 15 XP per non-empty template. One reward per identifier (or list/recipe pair). "
        "Editing, checking again or reopening never multiplies rewards.",
    )
    titles = (
        ("Commis", "Kitchen helper"),
        ("Apprenti cuisinier", "Apprentice cook"),
        ("Cuisinier curieux", "Curious cook"),
        ("Chef du quotidien", "Everyday chef"),
        ("Fin gourmet", "Food enthusiast"),
        ("Maître des saveurs", "Flavour master"),
        ("Chef inventif", "Creative chef"),
        ("Virtuose des fourneaux", "Kitchen virtuoso"),
        ("Grand chef", "Master chef"),
        ("Légende des saveurs", "Culinary legend"),
    )
    quests = (
        *quest_ladder(
            "recipes",
            MILESTONES,
            ("Mon carnet de recettes", "My recipe book"),
            ("Enregistrer {target} recettes distinctes.", "Save {target} distinct recipes."),
            "practice",
        ),
        *quest_ladder(
            "lists",
            MILESTONES,
            ("Le panier bien rempli", "A well-stocked basket"),
            ("Terminer {target} listes distinctes.", "Complete {target} distinct lists."),
            "mastery",
        ),
        *quest_ladder(
            "imports",
            MILESTONES,
            ("Du carnet au panier", "From book to basket"),
            (
                "Importer {target} couples liste/recette distincts.",
                "Import {target} distinct list/recipe pairs.",
            ),
            "exploration",
        ),
        *quest_ladder(
            "templates",
            MILESTONES,
            ("Mes indispensables", "My essentials"),
            ("Préparer {target} modèles non vides.", "Prepare {target} non-empty templates."),
            "exploration",
        ),
        *quest_ladder(
            "active_days",
            DAYS,
            ("Une cuisine vivante", "A lively kitchen"),
            ("Gagner des XP sur {target} jours distincts.", "Earn XP on {target} distinct days."),
            "consistency",
        ),
        *quest_ladder(
            "streak",
            STREAKS,
            ("Le goût des habitudes", "A taste for habits"),
            (
                "Atteindre une série de {target} jours éligibles.",
                "Reach a streak of {target} eligible days.",
            ),
            "streak",
        ),
    )

    def activity(self, event):
        if not event.reward_key:
            return None
        xp, metric = REWARDS[event.kind]
        return Activity(event.reward_key, event.occurred_at, xp, {metric: 1}, {})

    def history(self, db, user):
        for event in db.scalars(
            select(Event)
            .where(Event.owner_id == user.id, Event.reward_key.is_not(None))
            .order_by(Event.occurred_at, Event.id)
            .execution_options(yield_per=500)
        ):
            yield self.activity(event)


provider = RecipesProgression()
