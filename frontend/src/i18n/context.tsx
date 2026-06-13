import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "./locales/en";
import { it, type TranslationDict } from "./locales/it";
import {
  getStoredLocalePreference,
  resolveLocale,
  setStoredLocalePreference,
  type AppLocale,
  type LocalePreference,
} from "./storage";

type TranslateParams = Record<string, string | number>;

type I18nContextValue = {
  locale: AppLocale;
  preference: LocalePreference;
  setPreference: (pref: LocalePreference) => void;
  t: (key: string, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getNested(dict: TranslationDict, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] != null ? String(params[k]) : `{${k}}`
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LocalePreference>(() => getStoredLocalePreference());
  const locale = resolveLocale(preference);
  const dict = locale === "it" ? it : en;

  const setPreference = useCallback((pref: LocalePreference) => {
    setStoredLocalePreference(pref);
    setPreferenceState(pref);
  }, []);

  const t = useCallback(
    (key: string, params?: TranslateParams) => {
      const raw = getNested(dict, key) ?? getNested(it, key) ?? key;
      return interpolate(raw, params);
    },
    [dict]
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({ locale, preference, setPreference, t }),
    [locale, preference, setPreference, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
