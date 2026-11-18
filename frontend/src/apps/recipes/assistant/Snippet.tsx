import { number, unitLabel, tr } from "../i18n";
import type { Unit } from "../types";
import { SnippetDetails } from "../../../platform/assistant/components/SnippetDetails";
import { snippetValue } from "../../../platform/assistant/snippets";
import { detailLabels, detailValue } from "./detailLabels";
import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import { entities, records, text } from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
import { ShoppingItems } from "./ShoppingItems";
import { isShoppingList, shoppingDetails } from "./shopping";
import "./styles.css";
export function Snippet({ snippet }: AssistantSnippetProps) {
  const items = entities(snippet);
  const shopping = items.some(isShoppingList);
  return (
    <div className={shopping ? "recipes-shopping-snippet" : undefined}>
      <SnippetSummary icon="cart">
        {items.slice(0, 3).map((item, i) => (
          <div key={text(item.id) || i}>
            <SnippetLine
              title={text(item.title ?? item.name)}
              detail={[
                typeof item.servings === "number"
                  ? tr("for_people", { count: item.servings })
                  : "",
                text(item.instructions),
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            {isShoppingList(item) ? (
              <ShoppingItems items={item.items} list={item.kind === "list"} />
            ) : (
              records(item.items)
                .slice(0, 5)
                .map((ingredient, j) => (
                  <SnippetLine
                    key={j}
                    title={text(ingredient.name)}
                    detail={[
                      number(text(ingredient.quantity)),
                      unitLabel(text(ingredient.unit) as Unit),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                ))
            )}
          </div>
        ))}
      </SnippetSummary>
      <SnippetDetails
        value={shoppingDetails(snippetValue(snippet))}
        labels={{
          ...detailLabels(),
          ...(shopping ? { items: tr("assistant_field_shopping_items") } : {}),
        }}
        formatValue={(key, value, path) =>
          key === "unit" &&
          ["g", "mg", "l", "ml", "tsp", "tbsp", "u"].includes(String(value))
            ? unitLabel(value as Unit)
            : detailValue(key, value, path)
        }
      />
    </div>
  );
}
