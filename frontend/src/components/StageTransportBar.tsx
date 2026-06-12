import { formatTransportTime } from "../lib/midiNote";

type Props = {
  visible: boolean;
  paused: boolean;
  currentSec: number;
  durationSec: number;
  onSeek: (sec: number) => void;
  onTogglePause: () => void;
  onRestart: () => void;
};

/** Barra trasporto in basso: compare al movimento del mouse/touch, come i controlli nativi del video. */
export function StageTransportBar({
  visible,
  paused,
  currentSec,
  durationSec,
  onSeek,
  onTogglePause,
  onRestart,
}: Props) {
  const max = Math.max(0.1, durationSec);

  return (
    <div
      data-stage-controls
      onClick={(e) => e.stopPropagation()}
      className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-4 pb-4 pt-12 transition-opacity duration-300 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(currentSec, max)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Posizione brano"
        className="mb-3 h-1.5 w-full cursor-pointer accent-red-500"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTogglePause}
          title={paused ? "Riprendi" : "Pausa"}
          className="rounded-lg border border-zinc-600 bg-zinc-950/90 px-3 py-2 text-sm text-zinc-100 backdrop-blur hover:bg-zinc-800"
        >
          {paused ? "▶" : "⏸"}
        </button>
        <button
          type="button"
          onClick={onRestart}
          title="Ricomincia dall'inizio"
          className="rounded-lg border border-zinc-600 bg-zinc-950/90 px-3 py-2 text-sm text-zinc-100 backdrop-blur hover:bg-zinc-800"
        >
          ↻
        </button>
        <span className="font-mono text-xs tabular-nums text-zinc-300">
          {formatTransportTime(currentSec)} / {formatTransportTime(durationSec)}
        </span>
        {paused && (
          <span className="ml-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-0.5 text-[10px] uppercase tracking-widest text-amber-200">
            in pausa
          </span>
        )}
      </div>
    </div>
  );
}
