import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiBookMidi,
  apiBookYoutube,
  apiSearchSongs,
  apiSearchYoutube,
  getStoredEvent,
  type SongDto,
  type YoutubeSearchResult,
} from "../api/client";
import { MidiPreviewButton } from "./MidiPreviewButton";

const MIDI_PAGE = 40;
const YT_PAGE = 10;

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatSongMeta(s: SongDto): string {
  const head = [s.artist, s.year != null ? String(s.year) : null].filter(Boolean).join(" - ");
  if (s.genre) return head ? `${head} (${s.genre})` : s.genre;
  return head || "—";
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

/** Rimuove `-karaoke` dalla stringa (flag solo per la ricerca YouTube). */
function stripYoutubeFlags(query: string): string {
  return query
    .replace(/\s+-karaoke\b/gi, " ")
    .replace(/\b-karaoke\s+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function SongCoverThumb({ url }: { url?: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-12 w-12 shrink-0 rounded object-cover"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    );
  }
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-amber-500/15 text-lg text-amber-200/80"
      aria-hidden
    >
      🎵
    </div>
  );
}

export function BookCatalog() {
  const event = getStoredEvent();
  const [q, setQ] = useState("");
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [songsHasMore, setSongsHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [songsLoadingMore, setSongsLoadingMore] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [ytResults, setYtResults] = useState<YoutubeSearchResult[]>([]);
  const [ytHasMore, setYtHasMore] = useState(false);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytLoadingMore, setYtLoadingMore] = useState(false);
  /** Query dell'ultima ricerca YouTube completata (i risultati restano finché non cambia). */
  const [ytQueryDone, setYtQueryDone] = useState<string | null>(null);
  /** Id del video con l'anteprima aperta (una alla volta). */
  const [ytPreviewId, setYtPreviewId] = useState<string | null>(null);

  const songsAbortRef = useRef<AbortController | null>(null);
  const ytAbortRef = useRef<AbortController | null>(null);
  const songsQueryRef = useRef("");
  const ytQueryRef = useRef("");

  const loadSongs = useCallback(
    async (query: string, offset: number, append: boolean) => {
      if (!event) return;
      if (append) {
        if (query !== songsQueryRef.current) return;
      } else {
        songsAbortRef.current?.abort();
        songsAbortRef.current = new AbortController();
        songsQueryRef.current = query;
      }

      const signal = append ? undefined : songsAbortRef.current!.signal;

      if (append) setSongsLoadingMore(true);
      else setLoading(true);
      if (!append) setErr(null);

      try {
        const data = await apiSearchSongs(event.id, query || undefined, MIDI_PAGE, offset, signal);
        if (query !== songsQueryRef.current) return;
        setSongs((prev) => (append ? [...prev, ...data.songs] : data.songs));
        setSongsHasMore(data.hasMore);
      } catch (e) {
        if (isAbortError(e)) return;
        if (query !== songsQueryRef.current) return;
        if (!append) setSongs([]);
        setSongsHasMore(false);
        setErr(e instanceof Error ? e.message : "Errore");
      } finally {
        if (query === songsQueryRef.current) {
          setLoading(false);
          setSongsLoadingMore(false);
        }
      }
    },
    [event]
  );

  useEffect(() => {
    if (!event) return;
    const query = stripYoutubeFlags(q.trim());
    const delay = query ? 400 : 0;
    const timer = window.setTimeout(() => {
      void loadSongs(query, 0, false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [event?.id, q, loadSongs]);

  // i risultati YouTube valgono solo per la ricerca che li ha prodototti
  const showYt = ytQueryDone !== null && ytQueryDone === q.trim();

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!event) return;
    const query = q.trim();
    if (query.length < 2) return;

    ytAbortRef.current?.abort();
    ytAbortRef.current = new AbortController();
    ytQueryRef.current = query;
    const signal = ytAbortRef.current.signal;

    setErr(null);
    setMsg(null);
    setYtSearching(true);
    setYtPreviewId(null);
    try {
      const data = await apiSearchYoutube(event.id, query, YT_PAGE, 0, signal);
      if (query !== ytQueryRef.current) return;
      setYtResults(data.results);
      setYtHasMore(data.hasMore);
      setYtQueryDone(query);
    } catch (e2) {
      if (isAbortError(e2)) return;
      if (query !== ytQueryRef.current) return;
      setErr(e2 instanceof Error ? e2.message : "Ricerca YouTube fallita");
      setYtResults([]);
      setYtHasMore(false);
      setYtQueryDone(query);
    } finally {
      if (query === ytQueryRef.current) setYtSearching(false);
    }
  }

  async function loadMoreSongs() {
    if (!songsHasMore || songsLoadingMore || loading) return;
    await loadSongs(stripYoutubeFlags(songsQueryRef.current), songs.length, true);
  }

  async function loadMoreYoutube() {
    if (!event) return;
    const query = q.trim();
    if (!showYt || !ytHasMore || ytLoadingMore || ytSearching || query.length < 2) return;
    if (query !== ytQueryRef.current) return;

    setYtLoadingMore(true);
    setErr(null);
    try {
      const data = await apiSearchYoutube(event.id, query, YT_PAGE, ytResults.length);
      if (query !== ytQueryRef.current) return;
      setYtResults((prev) => [...prev, ...data.results]);
      setYtHasMore(data.hasMore);
    } catch (e) {
      if (query !== ytQueryRef.current) return;
      setErr(e instanceof Error ? e.message : "Caricamento risultati fallito");
    } finally {
      if (query === ytQueryRef.current) setYtLoadingMore(false);
    }
  }

  useEffect(() => {
    return () => {
      songsAbortRef.current?.abort();
      ytAbortRef.current?.abort();
    };
  }, []);

  async function book(song: SongDto) {
    if (!event) return;
    setErr(null);
    setMsg(null);
    setBookingId(song.id);
    try {
      await apiBookMidi(event.id, song.id);
      setMsg(`«${song.title}» aggiunta in coda.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBookingId(null);
    }
  }

  async function bookYt(r: YoutubeSearchResult) {
    if (!event) return;
    setErr(null);
    setMsg(null);
    setBookingId(r.id);
    try {
      await apiBookYoutube(event.id, r.url, r.title);
      setMsg(`«${r.title}» richiesta: in coda dopo l'ok di chi presenta.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
    } finally {
      setBookingId(null);
    }
  }

  if (!event) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        Nessuna serata in memoria. Vai a <strong>Entra nella serata</strong> con PIN e nickname.
      </div>
    );
  }

  const showLoadMore = songsHasMore || (showYt && ytHasMore);

  return (
    <div className="p-5 md:p-6">
      <h2 className="font-display text-lg font-semibold text-white">Prenota un brano</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Serata: <span className="text-zinc-200">{event.name}</span>
      </p>

      <form className="mt-4 flex gap-2" onSubmit={(e) => void search(e)}>
        <input
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-fuchsia-500/30 focus:ring-2"
          placeholder="Titolo, artista, file, genere, anno… (-karaoke su YouTube)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="submit"
          disabled={ytSearching || q.trim().length < 2}
          title="Cerca anche su YouTube"
          className="shrink-0 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
        >
          {ytSearching ? "…" : "Cerca"}
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-600">
        Il catalogo <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 text-amber-200/90">MIDI</span>{" "}
        si filtra mentre scrivi; con <strong className="text-zinc-400">Cerca</strong> arrivano anche i video{" "}
        <span className="rounded border border-red-500/40 bg-red-500/10 px-1 text-red-200/90">YouTube</span>{" "}
        (si aggiunge «karaoke»; scrivi <code className="rounded bg-zinc-800 px-1">-karaoke</code> per
        escluderlo). Usa{" "}
        <strong className="text-zinc-400">Carica altri</strong> per pagine aggiuntive.
      </p>

      {loading && songs.length === 0 && <p className="mt-3 text-sm text-zinc-500">Caricamento catalogo…</p>}
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}

      <ul className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto">
        {songs.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <SongCoverThumb url={s.coverUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-white">
                {s.title}{" "}
                <span className="ml-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] uppercase text-amber-200/90">
                  MIDI
                </span>
              </p>
              <p className="truncate text-sm text-zinc-400">{formatSongMeta(s)}</p>
              {s.fileName && (
                <p className="truncate text-xs text-zinc-600" title={s.fileName}>
                  {s.fileName}
                </p>
              )}
            </div>
            <MidiPreviewButton songId={s.id} />
            <button
              type="button"
              disabled={bookingId === s.id}
              onClick={() => void book(s)}
              className="shrink-0 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
            >
              {bookingId === s.id ? "…" : "Prenota"}
            </button>
          </li>
        ))}

        {showYt &&
          ytResults.map((r) => (
            <li key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  title={ytPreviewId === r.id ? "Chiudi anteprima" : "Guarda l'anteprima"}
                  onClick={() => setYtPreviewId((cur) => (cur === r.id ? null : r.id))}
                  className="relative shrink-0 overflow-hidden rounded"
                >
                  {r.thumbnail && (
                    <img src={r.thumbnail} alt="" className="h-12 w-20 object-cover" loading="lazy" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    {ytPreviewId === r.id ? "✕" : "▶"}
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white" title={r.title}>
                    {r.title}{" "}
                    <span className="ml-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 align-middle text-[10px] uppercase text-red-200/90">
                      YouTube
                    </span>
                  </p>
                  <p className="truncate text-sm text-zinc-400">
                    {r.channel}
                    {r.duration != null && <span className="text-zinc-600"> · {formatDuration(r.duration)}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={bookingId === r.id}
                  onClick={() => void bookYt(r)}
                  className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {bookingId === r.id ? "…" : "Prenota"}
                </button>
              </div>
              {ytPreviewId === r.id && (
                <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-black">
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.id)}?autoplay=1&rel=0`}
                    title={`Anteprima: ${r.title}`}
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                  />
                </div>
              )}
            </li>
          ))}

      </ul>

      {showLoadMore && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {songsHasMore && (
            <button
              type="button"
              disabled={songsLoadingMore || loading}
              onClick={() => void loadMoreSongs()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {songsLoadingMore ? "Carico…" : "Carica altri MIDI"}
            </button>
          )}
          {showYt && ytHasMore && (
            <button
              type="button"
              disabled={ytLoadingMore || ytSearching}
              onClick={() => void loadMoreYoutube()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {ytLoadingMore ? "Carico…" : "Carica altri video YouTube"}
            </button>
          )}
        </div>
      )}

      {!loading && songs.length === 0 && !showYt && (
        <p className="mt-4 text-center text-sm text-zinc-500">
          Nessun brano nel catalogo{q.trim() ? ` per «${q.trim()}»` : ""}. Premi{" "}
          <strong className="text-zinc-300">Cerca</strong> per trovarlo su YouTube.
        </p>
      )}
      {showYt && !ytSearching && songs.length === 0 && ytResults.length === 0 && (
        <p className="mt-4 text-center text-sm text-zinc-500">Nessun risultato, né MIDI né YouTube.</p>
      )}
    </div>
  );
}
