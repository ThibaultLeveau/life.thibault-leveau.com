export type Unit = "g" | "l" | "u";
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
