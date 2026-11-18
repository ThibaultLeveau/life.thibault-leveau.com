import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import {
  date,
  entities,
  record,
  text,
} from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  const data = record(snippet.data);
  const items =
    snippet.kind === "import_tasks" && Array.isArray(data.entity)
      ? data.entity.map(record)
      : entities(snippet);
  return (
    <SnippetSummary icon="check">
      {items.map((task, i) => (
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
            snippet.kind === "import_tasks" &&
            typeof task.description === "string"
              ? task.description
              : text(task.description),
          ]
            .filter(Boolean)
            .join(" · ")}
          done={!!task.completed_at}
        />
      ))}
    </SnippetSummary>
  );
}
