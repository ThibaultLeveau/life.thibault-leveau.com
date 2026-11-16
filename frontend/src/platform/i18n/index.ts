import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { resources, tr } from "../../shared/i18n";

export type Locale = "fr" | "en";
export function browserLocale(): Locale {
  for (const language of navigator.languages) {
    const primary = language.toLowerCase().split("-")[0];
    if (primary === "fr" || primary === "en") return primary;
  }
  return "fr";
}

void i18next.use(initReactI18next).init({
  lng: browserLocale(),
  fallbackLng: "fr",
  supportedLngs: ["fr", "en"],
  defaultNS: "common",
  ns: ["common"],
  resources: { fr: { common: resources.fr }, en: { common: resources.en } },
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function setLanguage(locale: Locale) {
  document.documentElement.lang = locale;
  if (i18next.language !== locale) void i18next.changeLanguage(locale);
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", tr("description"));
}
setLanguage(browserLocale());
