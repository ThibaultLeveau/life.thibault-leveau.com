import { number, unitLabel, tr } from "../i18n";
import type { Unit } from "../types";
import { SnippetDetails } from "../../../platform/assistant/components/SnippetDetails";
import { snippetValue } from "../../../platform/assistant/snippets";
import { detailLabels, detailValue } from "./detailLabels";
import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import { entities, records, text } from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  return (
    <>
      <SnippetSummary icon="cart">
        {entities(snippet)
          .slice(0, 3)
          .map((item, i) => (
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
                done={item.kind === "list" ? !!item.completed_at : undefined}
              />
              {records(item.items)
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
                    done={
                      item.kind === "list"
                        ? ingredient.checked === true
                        : undefined
                    }
                  />
                ))}
            </div>
          ))}
      </SnippetSummary>
      <SnippetDetails
        value={snippetValue(snippet)}
        labels={detailLabels()}
        formatValue={(key, value, path) =>
          key === "unit" &&
          ["g", "mg", "l", "ml", "tsp", "tbsp", "u"].includes(String(value))
            ? unitLabel(value as Unit)
            : detailValue(key, value, path)
        }
      />
    </>
  );
}
