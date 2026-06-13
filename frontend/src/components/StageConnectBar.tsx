import { formatTransportTime } from "../lib/midiNote";
import { useI18n } from "../i18n/context";

type Props = {
  connecting: boolean;
  connected: boolean;
  paused?: boolean;
  currentSec?: number;
  onConnect: () => void;
};

/** Barra in basso per il display guest: un solo tap per agganciarsi al proiettore. */
export function StageConnectBar({ connecting, connected, paused, currentSec, onConnect }: Props) {
  const { t } = useI18n();

  return (
    <div
      data-stage-controls
      className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-4 pt-12"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onConnect}
          disabled={connecting || connected}
          className="rounded-lg border border-cyan-500/50 bg-cyan-950/90 px-5 py-2.5 text-sm font-semibold text-cyan-100 backdrop-blur transition hover:bg-cyan-900/90 disabled:cursor-default disabled:border-zinc-700 disabled:bg-zinc-950/90 disabled:text-zinc-400"
        >
          {connected
            ? t("admin.stageConnect.connected")
            : connecting
              ? t("admin.stageConnect.connecting")
              : t("admin.stageConnect.connect")}
        </button>
        {connected && typeof currentSec === "number" && (
          <span className="font-mono text-xs tabular-nums text-zinc-300">{formatTransportTime(currentSec)}</span>
        )}
        {connected && paused && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-0.5 text-[10px] uppercase tracking-widest text-amber-200">
            {t("admin.stageConnect.paused")}
          </span>
        )}
        <span className="text-xs text-zinc-500">
          {connected ? t("admin.stageConnect.synced") : t("admin.stageConnect.hint")}
        </span>
      </div>
    </div>
  );
}
