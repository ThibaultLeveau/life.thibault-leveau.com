import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import { entities, records, text } from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  return (
    <SnippetSummary icon="cart">
      {entities(snippet).map((item, i) => (
        <div key={text(item.id) || i}>
          <SnippetLine
            title={text(item.title ?? item.name)}
            detail={text(item.instructions)}
            done={!!item.completed_at}
          />
          {records(item.items)
            .slice(0, 5)
            .map((ingredient, j) => (
              <SnippetLine
                key={j}
                title={text(ingredient.name)}
                detail={[text(ingredient.quantity), text(ingredient.unit)]
                  .filter(Boolean)
                  .join(" ")}
                done={ingredient.checked === true}
              />
            ))}
        </div>
      ))}
    </SnippetSummary>
  );
}
