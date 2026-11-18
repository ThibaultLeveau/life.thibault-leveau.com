import i18next from "i18next";
import fr from "./locales/fr.json";
import en from "./locales/en.json";

export const resources = { fr, en };
type PluralKey<Key> = Key extends `${infer Base}_one` | `${infer Base}_other`
  ? Base
  : never;
export type MessageKey = keyof typeof fr | PluralKey<keyof typeof fr>;

export function tr(key: MessageKey, values?: Record<string, unknown>): string {
  return i18next.t(key, { ns: "common", ...values });
}

export function formatLocale() {
  return i18next.language === "en" ? "en-GB" : "fr-FR";
}

export function documentationPath(page = "") {
  const prefix = i18next.resolvedLanguage === "en" ? "en/" : "";
  return `/documentation/${prefix}${page ? `${page}/` : ""}`;
}

/** Public error codes may also arrive inside SSE events and validation details. */
export function errorMessage(message: string): string {
  const code = /assistant\.([a-z_]+)/.exec(message)?.[1];
  if (!code) return message;
  const key = `assistant_error_${code}`;
  return key in resources.fr ? tr(key as MessageKey) : tr("assistant_error");
}
