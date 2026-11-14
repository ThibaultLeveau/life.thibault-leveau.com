import { useEffect, useState } from "react";
import { localDate } from "./types";

// Calendar dates are not instants: compare UTC midnights to avoid DST offsets.
export function relativeDate(value: string, today: string) {
  const days = Math.round(
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  const date = new Date(`${value}T12:00:00`);
  const full = date.toLocaleDateString("fr-FR", { dateStyle: "full" });
  const label =
    days === -1
      ? "Hier"
      : days === 0
        ? "Aujourd’hui"
        : days === 1
          ? "Demain"
          : days === 2
            ? "Après-demain"
            : days > 2 && days < 7
              ? date.toLocaleDateString("fr-FR", { weekday: "long" })
              : date.toLocaleDateString("fr-FR", {
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
