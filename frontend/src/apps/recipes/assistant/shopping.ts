import { number, record, text } from "../../../platform/assistant/snippets";
import { tr, unitLabel } from "../i18n";
import { units, type Unit } from "../types";

export function isShoppingList(value: unknown) {
  const item = record(value);
  return item.kind === "list" || item.kind === "template";
}

export function quantityLabel(quantity: unknown, unit: unknown) {
  return [
    number(quantity),
    units.includes(unit as Unit) ? unitLabel(unit as Unit) : text(unit),
  ]
    .filter(Boolean)
    .join(" ");
}

export function purchaseLabel(item: Record<string, unknown>) {
  return [
    typeof item.checked === "boolean"
      ? tr(item.checked ? "assistant_item_bought" : "assistant_item_to_buy")
      : "",
    number(item.purchased_quantity) !== ""
      ? tr("assistant_item_in_cart", {
          quantity: quantityLabel(item.purchased_quantity, item.unit),
        })
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

// Presentation only: keep every row, unknown field and list metadata in the
// existing details renderer. The receipt itself is never changed.
export function shoppingDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shoppingDetails);
  if (value === null || typeof value !== "object") return value;
  const object = record(value);
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [
      key,
      key === "items" && isShoppingList(object) && Array.isArray(child)
        ? child.map((value) => {
            const item = record(value);
            const {
              name,
              quantity,
              unit,
              checked,
              purchased_quantity,
              ...rest
            } = item;
            return {
              article: [text(name), quantityLabel(quantity, unit)]
                .filter(Boolean)
                .join(" · "),
              purchase: purchaseLabel({ checked, purchased_quantity, unit }),
              ...rest,
            };
          })
        : shoppingDetails(child),
    ]),
  );
}
