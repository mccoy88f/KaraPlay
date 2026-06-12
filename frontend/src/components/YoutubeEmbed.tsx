import { useState } from "react";

type Props = {
  ytUrl: string;
  title: string;
};

/** Estrae l'id video dalle forme comuni di URL YouTube (watch, youtu.be, shorts, embed). */
export function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (u.hostname.endsWith("youtube.com") || u.hostname.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = /^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
      if (m) return m[2];
    }
  } catch {
    /* URL non valido */
  }
  return null;
}

/**
 * Riproduce il video YouTube direttamente (l'audio è già nel video, niente download).
 * L'iframe parte dopo un click e riempe tutto lo spazio disponibile:
 * il display lascia in alto solo nome e voti.
 */
export function YoutubeEmbed({ ytUrl, title }: Props) {
  const [started, setStarted] = useState(false);
  const videoId = youtubeVideoId(ytUrl);

  if (!videoId) {
    return (
      <div className="flex max-w-2xl flex-col items-center gap-4">
        <h1 className="font-display text-4xl font-bold text-white">{title}</h1>
        <p className="text-sm text-red-400">URL YouTube non riconosciuto: {ytUrl}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl shadow-black/60">
      {started ? (
        <iframe
          className="h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&modestbranding=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center">
          <p className="font-display max-w-3xl text-2xl font-semibold text-white md:text-4xl">{title}</p>
          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs uppercase tracking-widest text-red-200/90">
            🎬 Free Style · YouTube
          </span>
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="rounded-xl bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-red-900/40 hover:bg-red-500"
          >
            ▶ Avvia video
          </button>
          <p className="text-xs text-zinc-400">
            Il browser richiede un tap su questo pulsante per avviare il video con l&apos;audio.
          </p>
        </div>
      )}
    </div>
  );
}
