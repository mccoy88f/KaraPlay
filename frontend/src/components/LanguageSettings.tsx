import { useI18n } from "../i18n/context";
import type { LocalePreference } from "../i18n/storage";

const OPTIONS: { id: LocalePreference; labelKey: "language.auto" | "language.italian" | "language.english" }[] = [
  { id: "auto", labelKey: "language.auto" },
  { id: "it", labelKey: "language.italian" },
  { id: "en", labelKey: "language.english" },
];

/** Selettore lingua condiviso (guest Profilo e admin Account). */
export function LanguageSettings() {
  const { preference, setPreference, t } = useI18n();

  return (
    <section className="kg-card p-5 md:p-6">
      <h2 className="font-display text-lg font-semibold text-white">{t("language.title")}</h2>
      <p className="mt-2 text-sm text-zinc-400">{t("language.hint")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setPreference(opt.id)}
            className={
              preference === opt.id
                ? "rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white"
                : "rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 hover:text-white"
            }
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>
    </section>
  );
}
