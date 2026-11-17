import type { AssistantSnippetProps } from "../../../platform/assistant/types";
import {
  date,
  entities,
  records,
  text,
} from "../../../platform/assistant/snippets";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
export function Snippet({ snippet }: AssistantSnippetProps) {
  return (
    <SnippetSummary icon="dumbbell">
      {entities(snippet).map((item, i) => (
        <div key={text(item.id) || i}>
          <SnippetLine
            title={text(item.name ?? item.title)}
            detail={[
              date(item.started_at ?? item.competition_date),
              text(item.notes),
            ]
              .filter(Boolean)
              .join(" · ")}
            done={item.status === "completed"}
          />
          {records(item.entries)
            .slice(0, 4)
            .map((entry, j) => (
              <SnippetLine
                key={j}
                title={text(entry.name ?? entry.exercise_name)}
                detail={[
                  text(entry.sets) && `${text(entry.sets)} ×`,
                  text(entry.notes),
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            ))}
        </div>
      ))}
    </SnippetSummary>
  );
}
