import { api } from "../../platform/api";
import type {
  BrowserCommand,
  BrowserFrame,
  RecipeImportDraft,
  Ingredient,
  ShoppingItemInput,
  Kind,
  PageResult,
  Recipe,
  RecipeEvent,
  RecipeInput,
  ShoppingList,
  Unit,
} from "./types";
const root = "/recipes";
export const recipesApi = {
  ingredients: (q: string, offset = 0, signal?: AbortSignal) =>
    api<PageResult<Ingredient>>(
      `${root}/ingredients?${new URLSearchParams({ q, offset: String(offset) })}`,
      "GET",
      undefined,
      signal,
    ),
  ingredient: (name: string, unit: Unit) =>
    api<Ingredient>(`${root}/ingredients`, "POST", { name, unit }),
  recipes: (q = "", archived = false, offset = 0, signal?: AbortSignal) =>
    api<PageResult<Recipe>>(
      `${root}/recipes?${new URLSearchParams({ q, archived: String(archived), offset: String(offset) })}`,
      "GET",
      undefined,
      signal,
    ),
  recipe: (id: string, servings?: number, signal?: AbortSignal) =>
    api<Recipe>(
      `${root}/recipes/${id}${servings ? `?servings=${servings}` : ""}`,
      "GET",
      undefined,
      signal,
    ),
  saveRecipe: (input: RecipeInput, previous?: Recipe) =>
    api<Recipe>(
      `${root}/recipes${previous ? `/${previous.id}` : ""}`,
      previous ? "PUT" : "POST",
      previous ? { ...input, expected_version: previous.version } : input,
    ),
  archiveRecipe: (item: Recipe, archived: boolean) =>
    api<Recipe>(`${root}/recipes/${item.id}/archive`, "PUT", {
      archived,
      expected_version: item.version,
    }),
  lists: (
    kind: Kind = "list",
    archived = false,
    q = "",
    offset = 0,
    signal?: AbortSignal,
  ) =>
    api<PageResult<ShoppingList>>(
      `${root}/lists?${new URLSearchParams({ kind, archived: String(archived), q, offset: String(offset) })}`,
      "GET",
      undefined,
      signal,
    ),
  list: (id: string, signal?: AbortSignal) =>
    api<ShoppingList>(`${root}/lists/${id}`, "GET", undefined, signal),
  createList: (title: string, kind: Kind) =>
    api<ShoppingList>(`${root}/lists`, "POST", { title, kind }),
  renameList: (item: ShoppingList, title: string) =>
    api<ShoppingList>(`${root}/lists/${item.id}`, "PUT", {
      title,
      expected_version: item.version,
    }),
  copyList: (item: ShoppingList, title: string, kind: Kind) =>
    api<ShoppingList>(`${root}/lists/${item.id}/copy`, "POST", {
      title,
      kind,
      expected_version: item.version,
    }),
  addItem: (list: ShoppingList, input: ShoppingItemInput) =>
    api<ShoppingList>(`${root}/lists/${list.id}/items`, "POST", {
      ...input,
      expected_version: list.version,
    }),
  editItem: (list: ShoppingList, id: string, quantity: string) =>
    api<ShoppingList>(`${root}/lists/${list.id}/items/${id}`, "PUT", {
      quantity,
      expected_version: list.version,
    }),
  removeItem: (list: ShoppingList, id: string) =>
    api<ShoppingList>(`${root}/lists/${list.id}/items/${id}`, "DELETE", {
      expected_version: list.version,
    }),
  check: (list: ShoppingList, id: string, checked: boolean) =>
    api<ShoppingList>(`${root}/lists/${list.id}/items/${id}/check`, "PUT", {
      checked,
      expected_version: list.version,
    }),
  import: (list: ShoppingList, recipe: Recipe, servings: number) =>
    api<ShoppingList>(`${root}/lists/${list.id}/import`, "POST", {
      recipe_id: recipe.id,
      recipe_version: recipe.version,
      servings,
      expected_version: list.version,
    }),
  complete: (list: ShoppingList, completed: boolean) =>
    api<ShoppingList>(`${root}/lists/${list.id}/complete`, "PUT", {
      completed,
      expected_version: list.version,
    }),
  archiveList: (list: ShoppingList, archived: boolean) =>
    api<ShoppingList>(`${root}/lists/${list.id}/archive`, "PUT", {
      archived,
      expected_version: list.version,
    }),
  history: (
    type: "recipes" | "lists",
    id: string,
    offset: number,
    signal?: AbortSignal,
  ) =>
    api<RecipeEvent[]>(
      `${root}/${type}/${id}/history?offset=${offset}`,
      "GET",
      undefined,
      signal,
    ),
};

const webRoot = `${root}/web-import`;
export const webImportApi = {
  open: (id: string, url: string, width: number, signal?: AbortSignal) =>
    api<BrowserFrame>(
      `${webRoot}/sessions`,
      "POST",
      { id, url, width },
      signal,
      false,
    ),
  frame: (id: string, signal?: AbortSignal) =>
    api<BrowserFrame>(
      `${webRoot}/sessions/${id}/frame`,
      "GET",
      undefined,
      signal,
    ),
  input: (id: string, command: BrowserCommand, signal?: AbortSignal) =>
    api<{ ok: boolean }>(
      `${webRoot}/sessions/${id}/input`,
      "POST",
      command,
      signal,
      false,
    ),
  close: (id: string) =>
    api<void>(
      `${webRoot}/sessions/${id}`,
      "DELETE",
      undefined,
      undefined,
      false,
    ),
  prepare: (
    source:
      | { session_id: string; document: number }
      | { text: string; source_url: string | null },
    signal?: AbortSignal,
  ) =>
    api<RecipeImportDraft>(`${webRoot}/prepare`, "POST", source, signal, false),
  save: (draft: RecipeImportDraft, signal?: AbortSignal) => {
    const { warnings: _warnings, ...payload } = draft;
    return api<Recipe>(
      `${webRoot}/save`,
      "POST",
      {
        ...payload,
        items: draft.items.map(({ name, ingredient_id, quantity, unit }) => ({
          name,
          ingredient_id,
          quantity,
          unit,
        })),
      },
      signal,
    );
  },
};
