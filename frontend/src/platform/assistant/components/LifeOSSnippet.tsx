import { tr } from "../../../shared/i18n";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
import { useApplications } from "../../applications/ApplicationProvider";
import { entities, record, records, text, date } from "../snippets";
import type { AssistantSnippetProps } from "../types";
export function LifeOSSnippet({ snippet }: AssistantSnippetProps) {
  const { items } = useApplications();
  return (
    <SnippetSummary icon="settings">
      {entities(snippet).map((entity, i) => (
        <div key={i}>
          {!!entity.theme && (
            <SnippetLine
              title={tr("appearance")}
              detail={
                entity.theme === "dark"
                  ? tr("dark_theme")
                  : entity.theme === "light"
                    ? tr("light_theme")
                    : tr("system_theme")
              }
            />
          )}
          {!!entity.locale && (
            <SnippetLine
              title={tr("language")}
              detail={entity.locale === "en" ? "English" : "Français"}
            />
          )}
          {!!entity.timezone && (
            <SnippetLine
              title={tr("progression_timezone")}
              detail={text(entity.timezone)}
            />
          )}
          {typeof entity.enabled === "boolean" && (
            <SnippetLine
              title={
                items?.find(
                  (app) =>
                    app.id === entity.application_id || app.id === entity.id,
                )?.name ||
                text(entity.name) ||
                "LifeOS"
              }
              detail={tr(
                entity.enabled
                  ? "assistant_app_enabled"
                  : "assistant_app_disabled",
              )}
              done={entity.enabled}
            />
          )}
          {records(entity.vacations).map((vacation, n) => (
            <SnippetLine
              key={n}
              title={tr("assistant_vacation")}
              detail={`${date(vacation.start)} — ${date(vacation.end)}`}
            />
          ))}
          {Object.entries(record(entity.usage_days)).map(([id, days]) => (
            <SnippetLine
              key={id}
              title={items?.find((app) => app.id === id)?.name || id}
              detail={
                Array.isArray(days)
                  ? tr("assistant_active_days", { count: days.length })
                  : undefined
              }
            />
          ))}
        </div>
      ))}
    </SnippetSummary>
  );
}
