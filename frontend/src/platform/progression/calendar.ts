import { formatLocale, tr } from "../../shared/i18n";
import type { ProgressionSettings } from "./types";

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export function usageDays(settings: ProgressionSettings, applicationId: string) {
  return (
    settings.usage_days[applicationId] ??
    (settings.exclude_weekends[applicationId] ? WEEKDAYS.slice(0, 5) : WEEKDAYS)
  );
}

export function weekdayLabel(day: number, weekday: "short" | "long" = "long") {
  // Anchor to a Monday and format in UTC so the browser timezone cannot shift it.
  return new Intl.DateTimeFormat(formatLocale(), {
    weekday,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 10, 16 + day)));
}

export function usageDaysLabel(days: number[]) {
  if (days.length === 7) return tr("progression_every_day");
  return days.map((day) => weekdayLabel(day, "short")).join(", ");
}
