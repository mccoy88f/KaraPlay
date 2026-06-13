export type LocalePreference = "auto" | "it" | "en";
export type AppLocale = "it" | "en";

const STORAGE_KEY = "karaoke_locale_pref";

export function getStoredLocalePreference(): LocalePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "it" || v === "en" || v === "auto") return v;
  } catch {
    /* storage blocked */
  }
  return "auto";
}

export function setStoredLocalePreference(pref: LocalePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
}

/** it → it, en* → en, anything else → en */
export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") return "en";
  const lang = (navigator.language || "en").toLowerCase();
  if (lang.startsWith("it")) return "it";
  return "en";
}

export function resolveLocale(preference: LocalePreference): AppLocale {
  if (preference === "it") return "it";
  if (preference === "en") return "en";
  return detectBrowserLocale();
}
