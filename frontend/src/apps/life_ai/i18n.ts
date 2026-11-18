import i18next from "i18next";
import { tr as common, type MessageKey as CommonKey } from "../../shared/i18n";
import fr from "./locales/fr.json";
import en from "./locales/en.json";
export const resources = { fr, en };
export type MessageKey = keyof typeof fr | CommonKey;
i18next.addResourceBundle("fr", "life_ai", fr);
i18next.addResourceBundle("en", "life_ai", en);
export function tr(key: MessageKey, values?: Record<string, unknown>): string {
  return key in fr
    ? i18next.t(key, { ns: "life_ai", ...values })
    : common(key as CommonKey, values);
}
