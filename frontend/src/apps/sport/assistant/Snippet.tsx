import { SnippetDetails } from "../../../platform/assistant/components/SnippetDetails";
import { snippetValue } from "../../../platform/assistant/snippets";
import { detailLabels, detailValue } from "./detailLabels";
import { tr as sportText } from "../i18n";
import { record } from "../../../platform/assistant/snippets";
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
      <SnippetSummary icon="dumbbell">
        {entities(snippet)
          .slice(0, 3)
          .map((item, i) => (
            <div key={text(item.id) || i}>
              <SnippetLine
                title={text(item.name ?? item.title) || date(item.measured_on)}
                detail={[
                  date(item.started_at ?? item.competition_date),
                  text(item.preparation_notes),
                  text(item.notes),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                done={
                  typeof item.status === "string"
                    ? item.status === "completed"
                    : undefined
                }
              />
              {Object.entries(item)
                .filter(
                  ([key, value]) =>
                    typeof value === "number" &&
                    (key.endsWith("_cm") ||
                      [
                        "weight_kg",
                        "body_fat_pct",
                        "completed_sessions",
                        "total_sets",
                        "total_volume_kg",
                        "total_distance_m",
                        "rest_seconds",
                      ].includes(key)),
                )
                .slice(0, 4)
                .map(([key, value]) => (
                  <SnippetLine
                    key={key}
                    title={detailLabels()[key] ?? key}
                    detail={number(value)}
                  />
                ))}
              {records(item.entries)
                .slice(0, 4)
                .map((entry, j) => (
                  <SnippetLine
                    key={j}
                    title={text(entry.name ?? entry.exercise_name)}
                    detail={[
                      text(entry.sets) &&
                        `${number(entry.sets)} ${sportText("sets_short").toLocaleLowerCase()}`,
                      ...Object.entries(record(entry.target))
                        .filter(([, value]) => value !== null)
                        .map(
                          ([key, value]) =>
                            `${number(value)} ${{ weight_kg: "kg", assistance_kg: "kg", reps: sportText("repetitions_unit"), distance_m: "m", duration_seconds: "s", calories: "kcal" }[key] ?? ""}`,
                        ),
                      text(entry.notes),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
