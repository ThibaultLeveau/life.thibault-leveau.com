import { SnippetDetails } from "../../../platform/assistant/components/SnippetDetails";
import { snippetValue } from "../../../platform/assistant/snippets";
import { detailLabels, detailValue } from "./detailLabels";
import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import { date, entities, record, text } from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  const data = record(snippet.data);
  return (
    <>
      <SnippetSummary icon="check">
        {entities(snippet)
          .slice(0, 3)
          .map((task, i) => (
            <SnippetLine
              key={text(task.id) || i}
              title={
                snippet.kind === "import_tasks" && Array.isArray(data.targets)
                  ? text(data.targets[i]) || text(task.title)
                  : text(task.title ?? task.name)
              }
              detail={[
                date(task.due_date),
                text(task.status_name),
                text(task.description),
              ]
                .filter(Boolean)
                .join(" · ")}
              done={!!task.completed_at}
            />
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
