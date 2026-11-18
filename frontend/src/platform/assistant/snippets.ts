import { formatLocale } from "../../shared/i18n";
import type { Snippet } from "./types";
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function text(value: unknown): string {
  return typeof value === "string"
    ? value
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
}
export function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
export function hasEntity(value: unknown) {
  return Array.isArray(value)
    ? value.length > 0
    : Object.keys(record(value)).length > 0;
}
export function entities(snippet: Snippet) {
  const data = record(snippet.data);
  const value =
    hasEntity(data.entity) || snippet.phase !== "preview"
      ? data.entity
      : data.arguments;
  const entity = record(value);
  const body = record(entity.body ?? entity.payload);
  if (Object.keys(body).length) return [body];
  if (Array.isArray(value)) return records(value);
  if (Array.isArray(entity.items) && !entity.title && !entity.name)
    return records(entity.items);
  if (Object.keys(entity).length) return [entity];
  return records(data.items);
}
export function date(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toLocaleDateString(formatLocale(), {
        day: "numeric",
        month: "short",
      });
}

/** Numeric API values only: personal strings (titles, notes, IDs) stay untouched. */
export function number(value: unknown, maximumFractionDigits = 6): string {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
  )
    return "";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat(formatLocale(), { maximumFractionDigits }).format(
        parsed,
      )
    : "";
}
export function snippetValue(snippet: Snippet): unknown {
  const data = record(snippet.data);
  if (hasEntity(data.entity) || snippet.phase !== "preview") return data.entity;
  const args = record(data.arguments);
  return args.payload ?? args.body ?? args;
}

/** Adapt a flat translation catalogue to field labels without business imports. */
export function prefixedLabels(
  catalogue: Record<string, string>,
  prefix: string,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalogue)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]),
  );
}
