import { SnippetDetails } from "../../../platform/assistant/components/SnippetDetails";
import { snippetValue } from "../../../platform/assistant/snippets";
import { detailLabels, detailValue } from "./detailLabels";
import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import {
  number,
  date,
  entities,
  records,
  text,
} from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  return (
    <>
      <SnippetSummary icon="flag">
        {entities(snippet)
          .slice(0, 3)
          .map((item, i) => (
            <div key={text(item.id) || i}>
              <SnippetLine
                title={text(item.title)}
                detail={[date(item.due_date), text(item.first_action)]
                  .filter(Boolean)
                  .join(" · ")}
                done={item.status === "done"}
              />
              {typeof item.progress === "number" && (
                <progress
                  className="assistant-snippet-progress"
                  value={item.progress}
                  max={100}
                  aria-label={text(item.title)}
                />
              )}
              {records(item.key_results)
                .slice(0, 3)
                .map((result, j) => (
                  <SnippetLine
                    key={j}
                    title={text(result.title)}
                    detail={`${number(result.current)} / ${number(result.target)} ${text(result.unit)}`}
                  />
                ))}
            </div>
          ))}
      </SnippetSummary>
      <SnippetDetails
        value={snippetValue(snippet)}
        labels={detailLabels()}
        formatValue={detailValue}
      />
    </>
  );
}
