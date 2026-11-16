import { formatLocale } from "../../shared/i18n";
import type { Frequency } from "./types";
export const iso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
export const parse = (value: string) => new Date(value + "T12:00:00Z");
export const addDays = (value: string, n: number) => {
  const d = parse(value);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export function localDay(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function windowFor(
  value: string,
  frequency: Frequency,
): [string, string] {
  const d = parse(value),
    year = d.getUTCFullYear(),
    month = d.getUTCMonth();
  if (frequency === "weekly") {
    const start = addDays(value, -((d.getUTCDay() + 6) % 7));
    return [start, addDays(start, 6)];
  }
  if (frequency === "monthly")
    return [
      iso(new Date(Date.UTC(year, month, 1))),
      iso(new Date(Date.UTC(year, month + 1, 0))),
    ];
  if (frequency === "yearly") return [`${year}-01-01`, `${year}-12-31`];
  return [value, value];
}
export function dateLabel(
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) {
  return new Intl.DateTimeFormat(formatLocale(), {
    ...options,
    timeZone: "UTC",
  }).format(parse(value));
}
export const number = (v: number) =>
  new Intl.NumberFormat(formatLocale(), { maximumFractionDigits: 2 }).format(v);

export function timestampLabel(value: string, timezone?: string) {
  return new Intl.DateTimeFormat(formatLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
