import { SnippetDetails } from "./SnippetDetails";
import { snippetValue } from "../snippets";
import { detailLabels } from "../detailLabels";
import { formatLocale, tr } from "../../../shared/i18n";
import { SnippetLine, SnippetSummary } from "../../../shared/ui/SnippetSummary";
import { useApplications } from "../../applications/ApplicationProvider";
import { number, entities, record, records, text, date } from "../snippets";
import type { AssistantSnippetProps } from "../types";
export function LifeOSSnippet({ snippet }: AssistantSnippetProps) {
  const { items } = useApplications();
  return (
    <>
      <SnippetSummary icon="settings">
        {entities(snippet)
          .slice(0, 3)
          .map((entity, i) => (
            <div key={i}>
              {typeof entity.level === "number" && (
                <SnippetLine
                  title={text(entity.title ?? entity.name)}
                  detail={`${tr("assistant_level", { level: number(entity.level) })} · ${number(entity.xp)} XP`}
                />
              )}
              {typeof entity.value === "number" && (
                <SnippetLine
                  title={text(entity.name ?? entity.label)}
                  detail={[number(entity.value), text(entity.unit)]
                    .filter(Boolean)
                    .join(" ")}
                />
              )}
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
                        app.id === entity.application_id ||
                        app.id === entity.id,
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
              {records(entity.vacations)
                .slice(0, 3)
                .map((vacation, n) => (
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
      <SnippetDetails
        value={snippetValue(snippet)}
        labels={detailLabels()}
        formatValue={(key, value, path) => {
          if (key === "theme")
            return value === "dark"
              ? tr("dark_theme")
              : value === "light"
                ? tr("light_theme")
                : tr("system_theme");
          if (key === "locale") return value === "en" ? "English" : "Français";
          if (
            path.includes("usage_days") &&
            typeof value === "number" &&
            value >= 0 &&
            value <= 6
          )
            return new Intl.DateTimeFormat(formatLocale(), {
              weekday: "long",
              timeZone: "UTC",
            }).format(new Date(Date.UTC(2024, 0, 1 + value)));
          return undefined;
        }}
      />
    </>
  );
}
