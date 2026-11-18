export const units = ["g", "mg", "l", "ml", "tsp", "tbsp", "u"] as const;
export type Unit = (typeof units)[number];
export type Kind = "list" | "template";
export interface Ingredient {
  id: string;
  name: string;
  name_fr: string;
  name_en: string;
  unit: Unit;
  category: string;
  builtin: boolean;
}
export interface ItemInput {
  ingredient_id: string;
  quantity: string;
  unit: Unit;
}
export interface Item extends ItemInput {
  id: string;
  name: string;
  category: string;
  position: number;
  purchased_quantity: string;
  checked: boolean;
}
export interface RecipeInput {
  title: string;
  servings: number;
  instructions: string;
  items: ItemInput[];
}
export interface Recipe extends RecipeInput {
  source_url: string | null;
  source_title: string | null;
  imported_at: string | null;
  id: string;
  version: number;
  base_servings: number;
  items: Item[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
export interface ShoppingList {
  id: string;
  title: string;
  kind: Kind;
  version: number;
  items: Item[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
}
export interface PageResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}
export interface RecipeEvent {
  id: string;
  kind: string;
  occurred_at: string;
  snapshot: { title: string; version: number };
}
export const itemInput = (item: ItemInput): ItemInput => ({
  ingredient_id: item.ingredient_id,
  quantity: item.quantity,
  unit: item.unit,
});

export interface BrowserFrame {
  id: string;
  url: string;
  title: string;
  document: number;
  width: number;
  height: number;
  image: string | null;
  expires_at: string;
}
export interface BrowserCommand {
  action:
    | "click"
    | "move"
    | "down"
    | "up"
    | "scroll"
    | "key"
    | "text"
    | "back"
    | "reload";
  document: number;
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  key?: string;
  text?: string;
}
export interface ImportedIngredient {
  name: string;
  source_text: string;
  quantity: string | null;
  unit: Unit | null;
  note: string;
  ingredient_id: string | null;
  catalogue_name: string | null;
}
export interface RecipeImportDraft {
  import_id: string;
  locale: "fr" | "en";
  title: string;
  servings: number | null;
  instructions: string;
  items: ImportedIngredient[];
  warnings: string[];
  source_url: string | null;
  source_title: string;
}
