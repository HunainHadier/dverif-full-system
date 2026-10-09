import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ur from "./locales/ur.json";

export const SUPPORTED_LANGUAGES = ["en", "ur"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "Dverif_lang";

function isLanguage(v: unknown): v is Language {
  return v === "en" || v === "ur";
}

export function detectLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isLanguage(stored)) return stored;
  try {
    const raw = window.localStorage.getItem("Dverif_user");
    const user = raw ? JSON.parse(raw) : null;
    if (isLanguage(user?.preferred_language)) return user.preferred_language;
  } catch {
    // ignore malformed stored user
  }
  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ur: { translation: ur },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(lang: Language) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }
  void i18n.changeLanguage(lang);
}

export function getLanguage(): Language {
  const current = i18n.language;
  return isLanguage(current) ? current : "en";
}

/** Locale string used by date/number formatters for the active UI language. */
export function uiLocale(): string {
  return getLanguage() === "ur" ? "ur-PK" : "en-PK";
}

const DOC_TYPE_KEYS: Record<string, string> = {
  degree: "docs.degree",
  "degree certificate": "docs.degree",
  license: "docs.license",
  "driving license": "docs.license",
  passport: "docs.passport",
  certificate: "docs.certificate",
  transcript: "docs.transcript",
  diploma: "docs.diploma",
  cnic: "docs.cnic",
  "national id card": "docs.cnic",
  "experience letter": "docs.experience",
  experience: "docs.experience",
};

/** Translate a free-text document type label, falling back to the raw value. */
export function tDocType(type?: string | null): string {
  if (!type) return "—";
  const key = DOC_TYPE_KEYS[type.trim().toLowerCase()];
  return key ? i18n.t(key) : type;
}

export default i18n;
