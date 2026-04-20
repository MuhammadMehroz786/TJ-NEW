import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./en.json";
import ar from "./ar.json";

export const SUPPORTED_LANGS = ["en", "ar"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

// Detection order: localStorage → navigator language → "en".
// We persist choice to localStorage under `tijarflow_lang` so it survives
// reloads even before the user profile is fetched.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "tijarflow_lang",
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });

// Apply RTL/LTR and lang attribute whenever the active language changes. This
// is the single place the DOM direction is controlled.
function applyDir(lang: string) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}
applyDir(i18n.language);
i18n.on("languageChanged", applyDir);

export default i18n;

/** Imperative helper — use when outside React. */
export function setLanguage(lang: SupportedLang): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem("tijarflow_lang", lang);
  } catch { /* ignore */ }
}

export function currentLanguage(): SupportedLang {
  return (i18n.language?.slice(0, 2) as SupportedLang) || "en";
}
