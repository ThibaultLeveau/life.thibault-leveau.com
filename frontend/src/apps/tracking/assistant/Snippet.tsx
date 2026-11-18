import { SnippetDetails } from "../../../platform/assistant/components/SnippetDetails";
import { snippetValue } from "../../../platform/assistant/snippets";
import { detailLabels, detailValue } from "./detailLabels";
import { formatLocale, tr } from "../../../shared/i18n";
import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import {
  number,
  records,
  date,
  entities,
  record,
  text,
} from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  return (
    <>
      <SnippetSummary icon="activity">
        {entities(snippet)
          .slice(0, 3)
          .map((item, i) => {
            const definition = record(item.definition);
            const entry = record(item.entry);
            const score = item.score ?? entry.score ?? item.average_score;
            const values = record(item.values ?? entry.values);
            const fields = records(item.fields ?? definition.fields);
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
                  done={
                    item.status === "complete" || entry.status === "complete"
                  }
                />
                {fields.slice(0, 3).map((field, j) => (
                  <SnippetLine
                    key={j}
                    title={text(field.label)}
                    detail={[
                      typeof values[text(field.id)] === "boolean"
                        ? tr(
                            values[text(field.id)]
                              ? "assistant_value_yes"
                              : "assistant_value_no",
                          )
                        : number(values[text(field.id)]) ||
                          text(values[text(field.id)]),
                      text(field.unit),
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                ))}
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
      <SnippetDetails
        value={snippetValue(snippet)}
        labels={detailLabels()}
        formatValue={detailValue}
      />
    </>
  );
}
