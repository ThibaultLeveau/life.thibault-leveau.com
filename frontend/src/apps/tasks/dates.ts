import { formatLocale } from "../../shared/i18n";
import { tr } from "./i18n";
import { useEffect, useState } from "react";
import { localDate } from "./types";

// Calendar dates are not instants: compare UTC midnights to avoid DST offsets.
export function relativeDate(value: string, today: string) {
  const days = Math.round(
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  const date = new Date(`${value}T12:00:00`);
  const full = date.toLocaleDateString(formatLocale(), { dateStyle: "full" });
  const label =
    days === -1
      ? tr("yesterday")
      : days === 0
        ? tr("today")
        : days === 1
          ? tr("tomorrow")
          : days === 2
            ? tr("day_after_tomorrow")
            : days > 2 && days < 7
              ? date.toLocaleDateString(formatLocale(), { weekday: "long" })
              : date.toLocaleDateString(formatLocale(), {
                  day: "numeric",
                  month: "short",
                  ...(value.slice(0, 4) !== today.slice(0, 4)
                    ? { year: "numeric" }
                    : {}),
                });
  const tone =
    days < 0
      ? "overdue"
      : days === 0
        ? "today"
        : days === 1
          ? "tomorrow"
          : days < 7
            ? "soon"
            : "later";
  return { label, full, tone };
}

export function useLocalToday() {
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setToday(localDate());
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
