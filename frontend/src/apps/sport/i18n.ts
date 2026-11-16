import i18next from "i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

export const resources = { fr, en };
type PluralKey<Key> = Key extends `${infer Base}_one` | `${infer Base}_other`
  ? Base
  : never;
export type MessageKey = keyof typeof fr | PluralKey<keyof typeof fr>;

i18next.addResourceBundle("fr", "sport", fr);
i18next.addResourceBundle("en", "sport", en);

export function tr(key: MessageKey, values?: Record<string, unknown>): string {
  return i18next.t(key, { ns: "sport", ...values });
}
