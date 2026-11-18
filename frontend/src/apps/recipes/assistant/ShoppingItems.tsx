import { records, text } from "../../../platform/assistant/snippets";
import { Icon } from "../../../shared/ui/Icon";
import { tr } from "../i18n";
import { purchaseLabel, quantityLabel } from "./shopping";

export function ShoppingItems({
  items,
  list,
}: {
  items: unknown;
  list: boolean;
}) {
  return (
    <ul className="recipes-snippet-items">
      {records(items)
        .slice(0, 5)
        .map((item, i) => (
          <li key={text(item.id) || i}>
            {list && (
              <>
                <span className="assistant-snippet-dot" aria-hidden="true">
                  {item.checked === true && <Icon name="check" size={12} />}
                </span>
                <span className="sr-only">{purchaseLabel(item)} </span>
              </>
            )}
            <span className="recipes-snippet-item-name">
              {text(item.name) || tr("shopping_item")}
            </span>
            <span className="recipes-snippet-item-quantity">
              {quantityLabel(item.quantity, item.unit)}
            </span>
          </li>
        ))}
    </ul>
  );
}
