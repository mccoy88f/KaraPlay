import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  apiBookMidi,
  apiBookYoutube,
  apiGetEventById,
  apiGetQueue,
  apiSearchSongs,
  apiSearchYoutube,
  getStoredEvent,
  getStoredUserId,
  setStoredEvent,
  type SongDto,
  type YoutubeSearchResult,
} from "../api/client";
import type { QueueBookingDto } from "../lib/queueDisplay";
import { MidiPreviewButton } from "./MidiPreviewButton";
import { QueueOverview } from "./QueueOverview";
import { useI18n } from "../i18n/context";

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

function SongCoverThumb({
  url,
  size = "sm",
}: {
  url?: string | null;
  size?: "sm" | "lg";
}) {
  const cls =
    size === "lg"
      ? "h-28 w-28 shrink-0 rounded-lg object-cover shadow-lg shadow-black/40"
      : "h-12 w-12 shrink-0 rounded object-cover";
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={cls}
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded bg-amber-500/15 text-amber-200/80 ${
        size === "lg" ? "h-28 w-28 rounded-lg text-4xl" : "h-12 w-12 text-lg"
      }`}
      aria-hidden
    >
      🎵
    </div>
  );
}

function SongDetailPanel({ song }: { song: SongDto }) {
  return (
    <div className="border-t border-zinc-800 px-3 pb-3 pt-3">
      <div className="flex gap-4">
        <SongCoverThumb url={song.coverUrl} size="lg" />
        <dl className="min-w-0 flex-1 space-y-2 text-sm">
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Titolo</dt>
            <dd className="font-medium leading-snug text-white">{song.title}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Artista</dt>
            <dd className="text-zinc-200">{song.artist || "—"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {song.year != null && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Anno</dt>
                <dd className="text-zinc-300">{song.year}</dd>
              </div>
            )}
            {song.genre && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Genere</dt>
                <dd className="text-zinc-300">{song.genre}</dd>
              </div>
            )}
            {song.duration != null && song.duration > 0 && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Durata</dt>
                <dd className="text-zinc-300">{formatDuration(song.duration)}</dd>
              </div>
            )}
          </div>
          {song.fileName && (
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">File</dt>
              <dd className="break-all text-xs text-zinc-500">{song.fileName}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

function BookPlusButton({
  busy,
  disabled,
  onClick,
  variant = "midi",
  t,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: "midi" | "youtube";
  t: (key: string) => string;
}) {
  const blocked = busy || disabled;
  return (
    <button
      type="button"
      disabled={blocked}
      aria-label={t("book.book")}
      title={disabled ? t("book.bookDisabled") : t("book.book")}
      onClick={onClick}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl font-semibold leading-none text-white disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === "youtube"
          ? "bg-red-600 hover:bg-red-500"
          : "bg-fuchsia-600 hover:bg-fuchsia-500"
      }`}
    >
      {busy ? "…" : "+"}
    </button>
  );
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

export type BookCatalogCoreProps = {
  eventId: string;
  eventName: string;
  viewerUserId?: string | null;
  /** Guest: false in DRAFT. Admin: sempre true (default). */
  bookingsOpen?: boolean;
  assignBar?: ReactNode;
  bookMidi: (songId: string, songTitle: string) => Promise<void>;
  bookYoutube: (url: string, title: string) => Promise<void>;
  onBooked?: () => void;
  midiBookedMessage?: (title: string) => string;
  ytBookedMessage?: (title: string) => string;
};

export function BookCatalogCore({
  eventId,
  eventName,
  viewerUserId,
  bookingsOpen = true,
  assignBar,
  bookMidi,
  bookYoutube,
  onBooked,
  midiBookedMessage,
  ytBookedMessage,
}: BookCatalogCoreProps) {
  const { t } = useI18n();
  const midiMsg = midiBookedMessage ?? ((title: string) => t("book.added", { title }));
  const ytMsg = ytBookedMessage ?? ((title: string) => t("book.ytAdded", { title }));
  const [q, setQ] = useState("");
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [songsHasMore, setSongsHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [songsLoadingMore, setSongsLoadingMore] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [queue, setQueue] = useState<QueueBookingDto[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);

  const [ytResults, setYtResults] = useState<YoutubeSearchResult[]>([]);
  const [ytHasMore, setYtHasMore] = useState(false);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytLoadingMore, setYtLoadingMore] = useState(false);
  const [ytQueryDone, setYtQueryDone] = useState<string | null>(null);
  const [ytPreviewId, setYtPreviewId] = useState<string | null>(null);
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);

  const songsAbortRef = useRef<AbortController | null>(null);
  const ytAbortRef = useRef<AbortController | null>(null);
  const songsQueryRef = useRef("");
  const ytQueryRef = useRef("");

  const loadQueue = useCallback(async () => {
    try {
      const data = await apiGetQueue(eventId);
      setQueue(data.queue ?? []);
    } catch {
      /* la scaletta si aggiorna al prossimo tentativo */
    } finally {
      setQueueLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    setQueueLoading(true);
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(), 15000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  const loadSongs = useCallback(
    async (query: string, offset: number, append: boolean) => {
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
        const data = await apiSearchSongs(eventId, query || undefined, MIDI_PAGE, offset, signal);
        if (query !== songsQueryRef.current) return;
        setSongs((prev) => (append ? [...prev, ...data.songs] : data.songs));
        setSongsHasMore(data.hasMore);
      } catch (e) {
        if (isAbortError(e)) return;
        if (query !== songsQueryRef.current) return;
        if (!append) setSongs([]);
        setSongsHasMore(false);
        setErr(e instanceof Error ? e.message : t("common.error"));
      } finally {
        if (query === songsQueryRef.current) {
          setLoading(false);
          setSongsLoadingMore(false);
        }
      }
    },
    [eventId]
  );

  useEffect(() => {
    const query = stripYoutubeFlags(q.trim());
    setExpandedSongId(null);
    const delay = query ? 400 : 0;
    const timer = window.setTimeout(() => {
      void loadSongs(query, 0, false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [eventId, q, loadSongs]);

  const showYt = ytQueryDone !== null && ytQueryDone === q.trim();

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
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
      const data = await apiSearchYoutube(eventId, query, YT_PAGE, 0, signal);
      if (query !== ytQueryRef.current) return;
      setYtResults(data.results);
      setYtHasMore(data.hasMore);
      setYtQueryDone(query);
    } catch (e2) {
      if (isAbortError(e2)) return;
      if (query !== ytQueryRef.current) return;
      setErr(e2 instanceof Error ? e2.message : t("common.error"));
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
    const query = q.trim();
    if (!showYt || !ytHasMore || ytLoadingMore || ytSearching || query.length < 2) return;
    if (query !== ytQueryRef.current) return;

    setYtLoadingMore(true);
    setErr(null);
    try {
      const data = await apiSearchYoutube(eventId, query, YT_PAGE, ytResults.length);
      if (query !== ytQueryRef.current) return;
      setYtResults((prev) => [...prev, ...data.results]);
      setYtHasMore(data.hasMore);
    } catch (e) {
      if (query !== ytQueryRef.current) return;
      setErr(e instanceof Error ? e.message : t("common.error"));
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
    if (!bookingsOpen) {
      setErr(t("book.prepBookError"));
      return;
    }
    setErr(null);
    setMsg(null);
    setBookingId(song.id);
    try {
      await bookMidi(song.id, song.title);
      setMsg(midiMsg(song.title));
      await loadQueue();
      onBooked?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBookingId(null);
    }
  }

  async function bookYt(r: YoutubeSearchResult) {
    if (!bookingsOpen) {
      setErr(t("book.prepBookError"));
      return;
    }
    setErr(null);
    setMsg(null);
    setBookingId(r.id);
    try {
      await bookYoutube(r.url, r.title);
      setMsg(ytMsg(r.title));
      await loadQueue();
      onBooked?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBookingId(null);
    }
  }

  const showLoadMore = songsHasMore || (showYt && ytHasMore);

  return (
    <div className="p-5 md:p-6">
      <QueueOverview queue={queue} viewerUserId={viewerUserId} loading={queueLoading} />

      <h2 className="font-display text-lg font-semibold text-white">{t("book.title")}</h2>
      <p className="mt-1 text-sm text-zinc-400">
        {t("book.event")}: <span className="text-zinc-200">{eventName}</span>
      </p>

      {assignBar && <div className="mt-4">{assignBar}</div>}

      {!bookingsOpen && (
        <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {t("book.prepBanner")}
        </p>
      )}

      <form className="mt-4 flex gap-2" onSubmit={(e) => void search(e)}>
        <input
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-fuchsia-500/30 focus:ring-2"
          placeholder={t("book.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="submit"
          disabled={ytSearching || q.trim().length < 2}
          title={t("book.searchYoutubeTitle")}
          className="shrink-0 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
        >
          {ytSearching ? "…" : t("book.search")}
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-600">{t("book.searchHint")}</p>

      {loading && songs.length === 0 && <p className="mt-3 text-sm text-zinc-500">{t("book.loadingCatalog")}</p>}
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}

      <ul className="mt-4 max-h-[26rem] space-y-2 overflow-y-auto">
        {songs.map((s) => {
          const expanded = expandedSongId === s.id;
          return (
            <li
              key={s.id}
              className={`rounded-lg border bg-zinc-950/60 ${
                expanded ? "border-fuchsia-500/30" : "border-zinc-800"
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                {!expanded && <SongCoverThumb url={s.coverUrl} size="sm" />}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setExpandedSongId((cur) => (cur === s.id ? null : s.id))}
                    className="w-full text-left"
                    aria-expanded={expanded}
                  >
                    <p className={`font-medium text-white ${expanded ? "" : "truncate"}`}>
                      {s.title}{" "}
                      <span className="ml-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 align-middle text-[10px] uppercase text-amber-200/90">
                        MIDI
                      </span>
                      <span className="ml-1 text-xs text-zinc-600">{expanded ? "▲" : "▼"}</span>
                    </p>
                    {!expanded && <p className="truncate text-sm text-zinc-400">{formatSongMeta(s)}</p>}
                  </button>
                </div>
                <MidiPreviewButton songId={s.id} />
                <BookPlusButton busy={bookingId === s.id} disabled={!bookingsOpen} onClick={() => void book(s)} t={t} />
              </div>
              {expanded && <SongDetailPanel song={s} />}
            </li>
          );
        })}

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
                <BookPlusButton
                  busy={bookingId === r.id}
                  disabled={!bookingsOpen}
                  variant="youtube"
                  onClick={() => void bookYt(r)}
                  t={t}
                />
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
              {songsLoadingMore ? t("book.loadingMore") : t("book.loadMoreMidi")}
            </button>
          )}
          {showYt && ytHasMore && (
            <button
              type="button"
              disabled={ytLoadingMore || ytSearching}
              onClick={() => void loadMoreYoutube()}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              {ytLoadingMore ? t("book.loadingMore") : t("book.loadMoreYt")}
            </button>
          )}
        </div>
      )}

      {!loading && songs.length === 0 && !showYt && (
        <p className="mt-4 text-center text-sm text-zinc-500">
          {t("book.noCatalog", {
            q: q.trim() ? t("book.noCatalogQ", { q: q.trim() }) : "",
          })}
        </p>
      )}
      {showYt && !ytSearching && songs.length === 0 && ytResults.length === 0 && (
        <p className="mt-4 text-center text-sm text-zinc-500">{t("book.noResults")}</p>
      )}
    </div>
  );
}

export function BookCatalog() {
  const { t } = useI18n();
  const storedEvent = getStoredEvent();
  const eventId = storedEvent?.id ?? null;
  const viewerUserId = getStoredUserId();
  const [eventStatus, setEventStatus] = useState(storedEvent?.status ?? "DRAFT");

  useEffect(() => {
    if (!eventId || !storedEvent) return;
    let cancelled = false;
    void apiGetEventById(eventId)
      .then((info) => {
        if (cancelled) return;
        setEventStatus(info.status);
        setStoredEvent({
          id: info.id,
          name: info.name,
          joinCode: info.joinCode,
          status: info.status,
          soundfontBankId: info.soundfontBankId,
        });
      })
      .catch(() => {
        /* usa lo stato in memoria */
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, storedEvent?.id]);

  if (!storedEvent || !eventId) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        {t("book.noSession")}
      </div>
    );
  }

  return (
    <BookCatalogCore
      eventId={eventId}
      eventName={storedEvent.name}
      viewerUserId={viewerUserId}
      bookingsOpen={eventStatus === "OPEN"}
      bookMidi={async (songId) => {
        await apiBookMidi(eventId, songId);
      }}
      bookYoutube={async (url, title) => {
        await apiBookYoutube(eventId, url, title);
      }}
      ytBookedMessage={(title) => t("book.ytPending", { title })}
    />
  );
}
