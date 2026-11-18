"""Recipe and shopping tools call the same owned, versioned services as HTTP routes."""

from typing import Annotated
from uuid import UUID

from pydantic import Field

from life_app.apps.recipes import models as m
from life_app.apps.recipes import schemas as s
from life_app.apps.recipes import service as svc
from life_app.platform.assistant.definition import ActionDefinition, ActionProvider, arguments

Offset = Annotated[int, Field(ge=0)]
Limit = Annotated[int, Field(ge=1, le=100)]
Search = Annotated[str, Field(max_length=160)]
IngredientSearch = Annotated[str, Field(max_length=120)]
Servings = Annotated[int, Field(ge=1, le=1000)]


def removed_item_targets(context, payload):
    shopping = svc.output(
        context.db, svc.owned(context.db, context.user, m.ShoppingList, payload.id)
    )
    return [
        f"{line.name} — {shopping.title}" for line in shopping.items if line.id == payload.item_id
    ]


provider = ActionProvider(
    actions=(
        ActionDefinition(
            name="list_ingredients",
            description="Search the shared bilingual catalogue and your private ingredients.",
            input_model=arguments(
                "RecipesIngredients",
                q=(IngredientSearch, ""),
                offset=(Offset, 0),
                limit=(Limit, 30),
            ),
            handler=lambda c, a: svc.ingredients(c.db, c.user, a.q, a.offset, a.limit),
            method="GET",
            path="/recipes/ingredients",
            output_model=s.IngredientPage,
        ),
        ActionDefinition(
            name="create_ingredient",
            description="Create a private ingredient or reuse an existing matching ingredient.",
            input_model=arguments("RecipesIngredientCreate", payload=(s.IngredientInput, ...)),
            handler=lambda c, a: svc.ingredient_output(
                svc.create_ingredient(c.db, c.user, a.payload)
            ),
            method="POST",
            path="/recipes/ingredients",
            mutating=True,
            output_model=s.IngredientOutput,
        ),
        ActionDefinition(
            name="list_recipes",
            description="Search owned active or archived recipes, with pagination.",
            input_model=arguments(
                "RecipesList",
                archived=(bool, False),
                q=(Search, ""),
                offset=(Offset, 0),
                limit=(Limit, 24),
            ),
            handler=lambda c, a: svc.page(
                c.db, c.user, m.Recipe, a.archived, a.q, a.offset, a.limit
            ),
            method="GET",
            path="/recipes/recipes",
            output_model=s.RecipePage,
        ),
        ActionDefinition(
            name="list_lists",
            description="Search owned shopping lists or templates, including archived items.",
            input_model=arguments(
                "RecipesShoppingLists",
                kind=(s.Kind, "list"),
                archived=(bool, False),
                q=(Search, ""),
                offset=(Offset, 0),
                limit=(Limit, 24),
            ),
            handler=lambda c, a: svc.page(
                c.db, c.user, m.ShoppingList, a.archived, a.q, a.offset, a.limit, a.kind
            ),
            method="GET",
            path="/recipes/lists",
            output_model=s.ListPage,
        ),
        ActionDefinition(
            name="create_recipe",
            description="Create a recipe with servings, instructions and ingredient quantities.",
            input_model=arguments("RecipesCreate", payload=(s.RecipeInput, ...)),
            handler=lambda c, a: svc.output(c.db, svc.create_recipe(c.db, c.user, a.payload)),
            method="POST",
            path="/recipes/recipes",
            mutating=True,
            output_model=s.RecipeOutput,
        ),
        ActionDefinition(
            name="get_recipe",
            description="Read an owned recipe; optional servings scales quantities without saving.",
            input_model=arguments("RecipesGet", id=(UUID, ...), servings=(Servings | None, None)),
            handler=lambda c, a: svc.output(
                c.db, svc.owned(c.db, c.user, m.Recipe, a.id), a.servings
            ),
            method="GET",
            path="/recipes/recipes/{id}",
            output_model=s.RecipeOutput,
        ),
        ActionDefinition(
            name="update_recipe",
            description="Replace recipe details and the ingredient list at its expected version.",
            input_model=arguments("RecipesUpdate", id=(UUID, ...), payload=(s.RecipeUpdate, ...)),
            handler=lambda c, a: svc.output(
                c.db,
                svc.update_recipe(c.db, c.user, svc.owned(c.db, c.user, m.Recipe, a.id), a.payload),
            ),
            method="PUT",
            path="/recipes/recipes/{id}",
            mutating=True,
            output_model=s.RecipeOutput,
        ),
        ActionDefinition(
            name="archive_recipe",
            description="Archive or restore a recipe while preserving ingredients and history.",
            input_model=arguments("RecipesArchive", id=(UUID, ...), payload=(s.Archive, ...)),
            handler=lambda c, a: svc.output(
                c.db, svc.archive(c.db, c.user, svc.owned(c.db, c.user, m.Recipe, a.id), a.payload)
            ),
            method="PUT",
            path="/recipes/recipes/{id}/archive",
            mutating=True,
            confirmation=True,
            output_model=s.RecipeOutput,
        ),
        ActionDefinition(
            name="recipe_history",
            description="Read an owned recipe's immutable event history.",
            input_model=arguments(
                "RecipesHistory", id=(UUID, ...), offset=(Offset, 0), limit=(Limit, 30)
            ),
            handler=lambda c, a: svc.history(
                c.db, c.user, svc.owned(c.db, c.user, m.Recipe, a.id), a.offset, a.limit
            ),
            method="GET",
            path="/recipes/recipes/{id}/history",
            output_model=list[s.EventOutput],
        ),
        ActionDefinition(
            name="create_list",
            description="Create a shopping list or template with catalogue or free-text items. "
            "Use name for any free item without creating an ingredient; defaults to 1 unit.",
            input_model=arguments("RecipesListCreate", payload=(s.ListInput, ...)),
            handler=lambda c, a: svc.output(c.db, svc.create_list(c.db, c.user, a.payload)),
            method="POST",
            path="/recipes/lists",
            mutating=True,
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="get_list",
            description="Read an owned shopping list or template, including quantities and checks.",
            input_model=arguments("RecipesListGet", id=(UUID, ...)),
            handler=lambda c, a: svc.output(c.db, svc.owned(c.db, c.user, m.ShoppingList, a.id)),
            method="GET",
            path="/recipes/lists/{id}",
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="update_list",
            description="Rename a shopping list or template at its expected version.",
            input_model=arguments("RecipesListUpdate", id=(UUID, ...), payload=(s.ListUpdate, ...)),
            handler=lambda c, a: svc.output(
                c.db,
                svc.update_list(
                    c.db, c.user, svc.owned(c.db, c.user, m.ShoppingList, a.id), a.payload
                ),
            ),
            method="PUT",
            path="/recipes/lists/{id}",
            mutating=True,
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="archive_list",
            description="Archive or restore a shopping list or template, preserving its history.",
            input_model=arguments("RecipesListArchive", id=(UUID, ...), payload=(s.Archive, ...)),
            handler=lambda c, a: svc.output(
                c.db,
                svc.archive(c.db, c.user, svc.owned(c.db, c.user, m.ShoppingList, a.id), a.payload),
            ),
            method="PUT",
            path="/recipes/lists/{id}/archive",
            mutating=True,
            confirmation=True,
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="list_history",
            description="Read an owned shopping list or template's immutable event history.",
            input_model=arguments(
                "RecipesListHistory", id=(UUID, ...), offset=(Offset, 0), limit=(Limit, 30)
            ),
            handler=lambda c, a: svc.history(
                c.db, c.user, svc.owned(c.db, c.user, m.ShoppingList, a.id), a.offset, a.limit
            ),
            method="GET",
            path="/recipes/lists/{id}/history",
            output_model=list[s.EventOutput],
        ),
        ActionDefinition(
            name="copy_list",
            description="Copy a list or template into a new one with all purchase checks cleared.",
            input_model=arguments("RecipesListCopy", id=(UUID, ...), payload=(s.ListCopy, ...)),
            handler=lambda c, a: svc.output(
                c.db,
                svc.copy_list(
                    c.db, c.user, svc.owned(c.db, c.user, m.ShoppingList, a.id), a.payload
                ),
            ),
            method="POST",
            path="/recipes/lists/{id}/copy",
            mutating=True,
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="add_item",
            description="Add any shopping item using name, or a catalogue ingredient using "
            "ingredient_id (exactly one). Defaults to 1 unit; matching identities/units add up. "
            "Free items do not create catalogue ingredients.",
            input_model=arguments("RecipesItemAdd", id=(UUID, ...), payload=(s.AddItem, ...)),
            handler=lambda c, a: svc.output(
                c.db,
                svc.add_item(
                    c.db, c.user, svc.owned(c.db, c.user, m.ShoppingList, a.id), a.payload
                ),
            ),
            method="POST",
            path="/recipes/lists/{id}/items",
            mutating=True,
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="import_recipe",
            description="Import recipe ingredients into a list, scaled to the requested servings.",
            input_model=arguments("RecipesImport", id=(UUID, ...), payload=(s.ImportRecipe, ...)),
            handler=lambda c, a: svc.output(
                c.db,
                svc.import_recipe(
                    c.db, c.user, svc.owned(c.db, c.user, m.ShoppingList, a.id), a.payload
                ),
            ),
            method="POST",
            path="/recipes/lists/{id}/import",
            mutating=True,
            confirmation=True,
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="complete_list",
            description="Complete a fully purchased shopping list, or reopen a completed list.",
            input_model=arguments(
                "RecipesListComplete", id=(UUID, ...), payload=(s.CompleteList, ...)
            ),
            handler=lambda c, a: svc.output(
                c.db,
                svc.complete(
                    c.db, c.user, svc.owned(c.db, c.user, m.ShoppingList, a.id), a.payload
                ),
            ),
            method="PUT",
            path="/recipes/lists/{id}/complete",
            mutating=True,
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="edit_item",
            description="Change a shopping item quantity at the list's expected version.",
            input_model=arguments(
                "RecipesItemEdit", id=(UUID, ...), item_id=(UUID, ...), payload=(s.EditItem, ...)
            ),
            handler=lambda c, a: svc.output(
                c.db,
                svc.change_item(
                    c.db,
                    c.user,
                    svc.owned(c.db, c.user, m.ShoppingList, a.id),
                    a.item_id,
                    a.payload,
                    "item_updated",
                ),
            ),
            method="PUT",
            path="/recipes/lists/{id}/items/{item_id}",
            mutating=True,
            output_model=s.ListOutput,
        ),
        ActionDefinition(
            name="remove_item",
            description="Remove an item from its owned list at the list's expected version.",
            input_model=arguments(
                "RecipesItemRemove", id=(UUID, ...), item_id=(UUID, ...), payload=(s.Version, ...)
            ),
            handler=lambda c, a: svc.output(
                c.db,
                svc.change_item(
                    c.db,
                    c.user,
                    svc.owned(c.db, c.user, m.ShoppingList, a.id),
                    a.item_id,
                    a.payload,
                    "item_removed",
                ),
            ),
            method="DELETE",
            path="/recipes/lists/{id}/items/{item_id}",
            mutating=True,
            confirmation=True,
            output_model=s.ListOutput,
            preview_targets=removed_item_targets,
        ),
        ActionDefinition(
            name="check_item",
            description="Mark an item as purchased or unpurchased at the list's current version.",
            input_model=arguments(
                "RecipesItemCheck", id=(UUID, ...), item_id=(UUID, ...), payload=(s.CheckItem, ...)
            ),
            handler=lambda c, a: svc.output(
                c.db,
                svc.change_item(
                    c.db,
                    c.user,
                    svc.owned(c.db, c.user, m.ShoppingList, a.id),
                    a.item_id,
                    a.payload,
                    "checked",
                ),
            ),
            method="PUT",
            path="/recipes/lists/{id}/items/{item_id}/check",
            mutating=True,
            output_model=s.ListOutput,
        ),
    )
)

provider = provider.with_labels(
    {
        "list_ingredients": ("Rechercher des ingrédients", "Find ingredients"),
        "create_ingredient": ("Créer un ingrédient", "Create an ingredient"),
        "list_recipes": ("Rechercher des recettes", "Find recipes"),
        "list_lists": ("Consulter les listes de courses", "View shopping lists"),
        "create_recipe": ("Créer une recette", "Create a recipe"),
        "get_recipe": ("Consulter une recette", "View a recipe"),
        "update_recipe": ("Modifier une recette", "Update a recipe"),
        "archive_recipe": ("Archiver ou restaurer une recette", "Archive or restore a recipe"),
        "recipe_history": ("Consulter l’historique d’une recette", "View recipe history"),
        "create_list": ("Créer une liste de courses", "Create a shopping list"),
        "get_list": ("Consulter une liste de courses", "View a shopping list"),
        "update_list": ("Renommer une liste de courses", "Rename a shopping list"),
        "archive_list": ("Archiver ou restaurer une liste", "Archive or restore a list"),
        "list_history": ("Consulter l’historique d’une liste", "View list history"),
        "copy_list": ("Copier une liste de courses", "Copy a shopping list"),
        "add_item": ("Ajouter un article aux courses", "Add a shopping item"),
        "import_recipe": ("Ajouter une recette aux courses", "Add a recipe to a shopping list"),
        "complete_list": ("Terminer ou rouvrir une liste", "Complete or reopen a list"),
        "edit_item": ("Modifier une quantité", "Change an item quantity"),
        "remove_item": ("Supprimer un article des courses", "Remove a shopping item"),
        "check_item": ("Cocher ou décocher un achat", "Check or uncheck an item"),
    }
)
