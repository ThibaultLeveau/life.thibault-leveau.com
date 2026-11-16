import i18next from "i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
export const resources = { fr, en };
export type MessageKey = keyof typeof fr;
i18next.addResourceBundle("fr", "tracking", fr);
i18next.addResourceBundle("en", "tracking", en);
export function tr(key: MessageKey, values?: Record<string, unknown>): string {
  return i18next.t(key, { ns: "tracking", ...values });
}
