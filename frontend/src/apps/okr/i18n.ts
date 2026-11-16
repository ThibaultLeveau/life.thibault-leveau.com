import i18next from "i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
export const resources = { fr, en };
export type MessageKey = keyof typeof fr;
i18next.addResourceBundle("fr", "okr", fr);
i18next.addResourceBundle("en", "okr", en);
export function tr(key: MessageKey, values?: Record<string, unknown>): string {
  return i18next.t(key, { ns: "okr", ...values });
}
export function number(value: number) {
  return new Intl.NumberFormat(i18next.language, {
    maximumFractionDigits: 2,
  }).format(value);
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat(i18next.language, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value.length === 10 ? value + "T12:00:00" : value));
}
export function quarterLabel(value: string) {
  return tr("quarter_label", {
    year: value.slice(0, 4),
    quarter: value.slice(-1),
  });
}
