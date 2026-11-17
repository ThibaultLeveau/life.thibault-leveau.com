import i18next from "i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
export const resources = { fr, en };
export type MessageKey = keyof typeof fr | "items" | "for_people";
i18next.addResourceBundle("fr", "recipes", fr);
i18next.addResourceBundle("en", "recipes", en);
export function tr(key: MessageKey, values?: Record<string, unknown>): string {
  return i18next.t(key, { ns: "recipes", ...values });
}
export function number(value: number | string) {
  return new Intl.NumberFormat(i18next.language, {
    maximumFractionDigits: 6,
  }).format(Number(value));
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat(i18next.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
