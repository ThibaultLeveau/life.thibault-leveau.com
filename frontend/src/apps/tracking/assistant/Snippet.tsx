import { formatLocale } from "../../../shared/i18n";
import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import {
  date,
  entities,
  record,
  text,
} from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  return (
    <SnippetSummary icon="activity">
      {entities(snippet).map((item, i) => {
        const definition = record(item.definition);
        const entry = record(item.entry);
        const score = item.score ?? entry.score;
        return (
          <div key={text(item.id) || i}>
            <SnippetLine
              title={text(item.name ?? definition.name)}
              detail={[
                date(item.period_start ?? item.start_date),
                text(item.description),
              ]
                .filter(Boolean)
                .join(" · ")}
              done={item.status === "complete" || entry.status === "complete"}
            />
            {typeof score === "number" && (
              <strong className="assistant-snippet-score">
                {score.toLocaleString(formatLocale(), {
                  maximumFractionDigits: 1,
                })}
                <small>/10</small>
              </strong>
            )}
          </div>
        );
      })}
    </SnippetSummary>
  );
}
