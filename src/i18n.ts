import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// i18n bootstrap: tiny file, surprisingly capable of breaking everything.

import en from "./locales/en.json";
import es from "./locales/es.json";
import cs from "./locales/cs.json";
import ar from "./locales/ar.json";
import ru from "./locales/ru.json";
import de from "./locales/de.json";

const STORAGE_KEY = "butter:language";

const normalizeLang = (lang: string | null | undefined) => {
  const raw = (lang || "").trim();
  if (!raw) return null;
  const base = raw.toLowerCase().split(/[-_]/g)[0];
  if (
    base === "en" ||
    base === "es" ||
    base === "cs" ||
    base === "ar" ||
    base === "ru" ||
    base === "de"
  )
    return base;
  return null;
};

export const getInitialLanguage = () => {
  try {
    const stored = normalizeLang(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // ignore
  }

  const sys = normalizeLang(typeof navigator !== "undefined" ? navigator.language : "en");
  return sys || "en";
};

export const setStoredLanguage = (lang: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
};

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      cs: { translation: cs },
      ar: { translation: ar },
      ru: { translation: ru },
      de: { translation: de },
    },
    lng: getInitialLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
    returnEmptyString: false,
  });

export default i18n;
