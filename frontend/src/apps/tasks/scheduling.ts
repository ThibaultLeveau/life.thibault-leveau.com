import { formatLocale } from "../../shared/i18n";
import { tr } from "./i18n";
import { useEffect, useState } from "react";
import { api } from "../../platform/api";
import { useLocalToday } from "./dates";
import type { Recurrence, ScheduleSuggestion } from "./types";

export const weekdays = () =>
  Array.from({ length: 7 }, (_, day) =>
    new Date(2026, 10, 16 + day, 12).toLocaleDateString(formatLocale(), {
      weekday: "long",
    }),
  );
export const dayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const months = () =>
  Array.from({ length: 12 }, (_, month) =>
    new Date(2026, month, 1, 12).toLocaleDateString(formatLocale(), {
      month: "long",
    }),
  );
export function timezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
}
export function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function plusDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateString(value);
}
export function newRecurrence(start: string): Recurrence {
  return {
    rrule: "FREQ=WEEKLY",
    start_date: start,
    timezone: timezone(),
    mode: "scheduled",
    end_date: null,
    max_occurrences: null,
    excluded_dates: [],
  };
}
function positionedDay(day: string, value: string) {
  const positions: Record<string, string> = {
    "1": tr("ordinal_first"),
    "2": tr("ordinal_second"),
    "3": tr("ordinal_third"),
    "4": tr("ordinal_fourth"),
    "5": tr("ordinal_fifth"),
    "-1": tr("ordinal_last"),
    "-2": tr("ordinal_penultimate"),
  };
  if (!value) return day;
  if (positions[value]) return `${positions[value]} ${day}`;
  const number = Math.abs(Number(value));
  const category = new Intl.PluralRules(formatLocale(), {
    type: "ordinal",
  }).select(number);
  const suffixes: Record<string, string> = {
    one: tr("ordinal_suffix_one"),
    two: tr("ordinal_suffix_two"),
    few: tr("ordinal_suffix_few"),
    other: tr("ordinal_suffix_other"),
  };
  return tr(Number(value) < 0 ? "ordinal_negative" : "ordinal_positive", {
    number: `${number}${suffixes[category] ?? suffixes.other}`,
    day,
  });
}
export function shortRecurrence(rule: Recurrence) {
  const parts: Record<string, string> = Object.fromEntries(
    rule.rrule.split(";").map((part) => part.split("=")),
  );
  const interval = Number(parts.INTERVAL || 1);
  const units: Record<string, string> = {
    DAILY: tr("days"),
    WEEKLY: tr("weeks"),
    MONTHLY: tr("months"),
    YEARLY: tr("years"),
  };
  const labels: Record<string, string> = {
    DAILY: tr("every_day"),
    WEEKLY: tr("every_week"),
    MONTHLY: tr("every_month"),
    YEARLY: tr("every_year"),
  };
  let label =
    interval === 1
      ? labels[parts.FREQ] || tr("custom_recurrence")
      : `${parts.FREQ === "WEEKLY" ? tr("every") : tr("every_interval")} ${interval} ${units[parts.FREQ]}`;
  const group = (
    {
      "MO,TU,WE,TH,FR": tr("business_day"),
      "MO,TU,WE,TH,FR,SA": tr("working_day"),
      "SA,SU": tr("weekend_day"),
    } as Record<string, string>
  )[parts.BYDAY];
  const groupedPosition = parts.BYSETPOS && group;
  if (groupedPosition)
    label += ` · ${parts.BYSETPOS.split(",")
      .map((value) => positionedDay(group, value))
      .join(", ")}`;
  else if (parts.BYDAY)
    label += ` · ${parts.BYDAY.split(",")
      .map((day) =>
        positionedDay(
          weekdays()[dayCodes.indexOf(day.slice(-2))],
          day.slice(0, -2),
        ),
      )
      .join(", ")}`;
  if (parts.BYMONTHDAY)
    label += ` · ${parts.BYMONTHDAY.split(",")
      .map((value) =>
        Number(value) < 0
          ? positionedDay(tr("calendar_day"), value)
          : tr("day_number", { number: value }),
      )
      .join(", ")}`;
  if (parts.BYMONTH)
    label += ` · ${parts.BYMONTH.split(",")
      .map((month) => months()[Number(month) - 1])
      .join(", ")}`;
  if (parts.BYWEEKNO || parts.BYYEARDAY) label += tr("custom_schedule");
  if (rule.mode === "completion") label += tr("after_completion_suffix");
  return label;
}
export async function parseSchedule(
  text: string,
  today: string,
  signal?: AbortSignal,
) {
  return api<ScheduleSuggestion>(
    "/scheduling/parse",
    "POST",
    { text, today, timezone: timezone() },
    signal,
  );
}

/** Keep drafts local, server interpretation authoritative, stale responses invisible. */
export function useScheduleRecognition(text: string, enabled = true) {
  const today = useLocalToday();
  const [result, setResult] = useState<{
    key: string;
    value: ScheduleSuggestion;
  } | null>(null);
  const [ignored, setIgnored] = useState<string | null>(null);
  const [error, setError] = useState("");
  const key = `${today}:${text}`;
  const active = enabled && !!text.trim() && ignored !== key;
  useEffect(() => {
    setError("");
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      parseSchedule(text, today, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setResult({ key, value });
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted) setError(error.message);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, today, key, active]);
  const current = active && result?.key === key ? result.value : null;
  return {
    suggestion: current?.matched_text ? current : null,
    pending: active && !current && !error,
    error,
    diagnostic: current?.diagnostic ?? null,
    ignored: ignored === key,
    dismiss: (literal = text) => setIgnored(`${today}:${literal}`),
    restore: () => setIgnored(null),
    resolve: async () => {
      const parsed = active
        ? (current ?? (await parseSchedule(text, today)))
        : null;
      if (parsed?.diagnostic)
        throw new Error(
          tr("correct_schedule_input", { diagnostic: parsed.diagnostic }),
        );
      return parsed;
    },
  };
}
