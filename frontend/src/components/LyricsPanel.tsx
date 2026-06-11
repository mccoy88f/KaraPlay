import type { LrcLine } from "../lib/lrc";

type Props = {
  lines: LrcLine[];
  /** Indice riga corrente (da currentLrcIndex); -1 prima dell'inizio. */
  index: number;
  title: string;
  /** Mostrato sotto il titolo quando non c'è un LRC. */
  noLyricsHint: string;
};

export function LyricsPanel({ lines, index, title, noLyricsHint }: Props) {
  const idxShow = index < 0 ? 0 : index;

  return (
    <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 px-6 py-10 text-left shadow-inner shadow-black/40">
      {lines.length > 0 ? (
        <div className="space-y-6">
          {lines[idxShow - 1] && (
            <p className="text-xl text-zinc-600 line-through decoration-zinc-700 md:text-2xl">
              {lines[idxShow - 1].text}
            </p>
          )}
          <p className="text-3xl font-semibold leading-tight text-fuchsia-100 drop-shadow-[0_0_20px_rgba(232,121,249,0.25)] md:text-5xl">
            {lines[idxShow]?.text ?? "…"}
          </p>
          {lines[idxShow + 1] && (
            <p className="text-xl text-zinc-500 md:text-2xl">{lines[idxShow + 1].text}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-lg text-zinc-400">
            <span className="font-semibold text-zinc-200">{title}</span>
          </p>
          <p className="text-sm text-zinc-500">{noLyricsHint}</p>
        </div>
      )}
    </div>
  );
}
