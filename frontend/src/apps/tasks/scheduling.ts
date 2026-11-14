import { useEffect, useState } from "react";
import { api } from "../../platform/api";
import { useLocalToday } from "./dates";
import type { Recurrence, ScheduleSuggestion } from "./types";

export const weekdays = [
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];
export const dayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const months = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
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
    "1": "premier",
    "2": "deuxième",
    "3": "troisième",
    "4": "quatrième",
    "5": "cinquième",
    "-1": "dernier",
    "-2": "avant-dernier",
  };
  if (!value) return day;
  if (positions[value]) return `${positions[value]} ${day}`;
  return Number(value) < 0
    ? `${Math.abs(Number(value))}ᵉ ${day} en partant de la fin`
    : `${value}ᵉ ${day}`;
}
export function shortRecurrence(rule: Recurrence) {
  const parts: Record<string, string> = Object.fromEntries(
    rule.rrule.split(";").map((part) => part.split("=")),
  );
  const interval = Number(parts.INTERVAL || 1);
  const units: Record<string, string> = {
    DAILY: "jours",
    WEEKLY: "semaines",
    MONTHLY: "mois",
    YEARLY: "ans",
  };
  const labels: Record<string, string> = {
    DAILY: "Chaque jour",
    WEEKLY: "Chaque semaine",
    MONTHLY: "Chaque mois",
    YEARLY: "Chaque année",
  };
  let label =
    interval === 1
      ? labels[parts.FREQ] || "Récurrence personnalisée"
      : `${parts.FREQ === "WEEKLY" ? "Toutes les" : "Tous les"} ${interval} ${units[parts.FREQ]}`;
  const group = ({
    "MO,TU,WE,TH,FR": "jour ouvré",
    "MO,TU,WE,TH,FR,SA": "jour ouvrable",
    "SA,SU": "jour du week-end",
  } as Record<string, string>)[parts.BYDAY];
  const groupedPosition = parts.BYSETPOS && group;
  if (groupedPosition)
    label += ` · ${parts.BYSETPOS.split(",")
      .map((value) => positionedDay(group, value))
      .join(", ")}`;
  else if (parts.BYDAY)
    label += ` · ${parts.BYDAY.split(",")
      .map((day) =>
        positionedDay(weekdays[dayCodes.indexOf(day.slice(-2))], day.slice(0, -2)),
      )
      .join(", ")}`;
  if (parts.BYMONTHDAY)
    label += ` · ${parts.BYMONTHDAY.split(",")
      .map((value) =>
        Number(value) < 0 ? positionedDay("jour", value) : `le ${value}`,
      )
      .join(", ")}`;
  if (parts.BYMONTH)
    label += ` · ${parts.BYMONTH.split(",")
      .map((month) => months[Number(month) - 1])
      .join(", ")}`;
  if (parts.BYWEEKNO || parts.BYYEARDAY) label += " · calendrier personnalisé";
  if (rule.mode === "completion") label += " après résolution";
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
          `${parsed.diagnostic} Corrigez la saisie ou choisissez « Garder le texte ».`,
        );
      return parsed;
    },
  };
}
