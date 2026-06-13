import type { ReactNode } from "react";

/** Cornice palco condivisa tra MIDI, video scaricati e YouTube embed. */
export const STAGE_SHELL_CLASS =
  "relative min-h-0 w-full flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/60";

const DEFAULT_HINT = "Il browser richiede un tap su questo pulsante per avviare l'audio.";

type Props = {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  error?: string | null;
  /** Mostrato al posto del pulsante (es. «Carico il brano…»). */
  waitingText?: string | null;
  showButton?: boolean;
  buttonLabel: string;
  buttonDisabled?: boolean;
  /** 0–100: barra sotto il pulsante durante il caricamento del banco sonoro. */
  loadProgressPct?: number | null;
  onStart: () => void;
  hint?: string;
};

/** Schermata iniziale con tap-to-start, identica su tutti i player del display. */
export function StageStartOverlay({
  title,
  subtitle,
  badges,
  error,
  waitingText,
  showButton = true,
  buttonLabel,
  buttonDisabled,
  loadProgressPct,
  onStart,
  hint = DEFAULT_HINT,
}: Props) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center">
      <p className="font-display max-w-3xl text-2xl font-semibold text-white md:text-4xl">{title}</p>
      {subtitle ? <p className="text-zinc-400">{subtitle}</p> : null}
      {badges}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {showButton ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <button
            type="button"
            disabled={buttonDisabled}
            onClick={onStart}
            className="rounded-xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-red-900/40 hover:bg-red-500 disabled:opacity-50"
          >
            {buttonLabel}
          </button>
          {loadProgressPct != null && buttonDisabled && (
            <div className="w-full">
              <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-fuchsia-500 transition-[width] duration-150"
                  style={{ width: `${loadProgressPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs tabular-nums text-zinc-500">{loadProgressPct}%</p>
            </div>
          )}
        </div>
      ) : waitingText ? (
        <p className="text-sm text-zinc-500">{waitingText}</p>
      ) : null}
      <p className="text-xs text-zinc-400">{hint}</p>
    </div>
  );
}
