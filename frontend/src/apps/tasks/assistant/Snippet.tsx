import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import { date, entities, text } from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  return (
    <SnippetSummary icon="check">
      {entities(snippet).map((task, i) => (
        <SnippetLine
          key={text(task.id) || i}
          title={text(task.title ?? task.name)}
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
  );
}
