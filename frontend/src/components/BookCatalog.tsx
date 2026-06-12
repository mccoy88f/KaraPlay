import { useEffect, useMemo, useState } from "react";
import {
  apiBookMidi,
  apiBookYoutube,
  apiSearchSongs,
  apiSearchYoutube,
  getStoredEvent,
  type SongDto,
  type YoutubeSearchResult,
} from "../api/client";
import { getSoundfontBank } from "../lib/soundfontBanks";
import { MidiPreviewButton } from "./MidiPreviewButton";

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function BookCatalog() {
  const event = getStoredEvent();
  const bankLabel = event?.soundfontBankId
    ? getSoundfontBank(event.soundfontBankId).shortLabel
    : null;
  const [tab, setTab] = useState<"midi" | "youtube">("midi");
  const [q, setQ] = useState("");
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YoutubeSearchResult[]>([]);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytSearched, setYtSearched] = useState(false);
  /** Id del video con l'anteprima aperta (una alla volta). */
  const [ytPreviewId, setYtPreviewId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiSearchSongs();
        if (!cancelled) setSongs(data.songs);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Errore");
          setSongs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return songs;
    const l = q.toLowerCase();
    return songs.filter(
      (s) => s.title.toLowerCase().includes(l) || s.artist.toLowerCase().includes(l)
    );
  }, [songs, q]);

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

  async function searchYt() {
    if (ytQuery.trim().length < 2) return;
    setErr(null);
    setMsg(null);
    setYtSearching(true);
    try {
      const data = await apiSearchYoutube(ytQuery);
      setYtResults(data.results);
      setYtSearched(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ricerca fallita");
      setYtResults([]);
    } finally {
      setYtSearching(false);
    }
  }

  async function bookYt(r: YoutubeSearchResult) {
    if (!event) return;
    setErr(null);
    setMsg(null);
    setBookingId(r.id);
    try {
      await apiBookYoutube(event.id, r.url, r.title);
      setMsg(`«${r.title}» richiesta: in coda dopo l'approvazione dell'host.`);
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

  return (
    <div className="p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-white">Prenota un brano</h2>
        {bankLabel && (
          <span className="rounded-full border border-zinc-700 bg-zinc-950/80 px-2.5 py-1 text-xs text-zinc-500" title="Impostato dall'admin">
            Banco {bankLabel}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Serata: <span className="text-zinc-200">{event.name}</span>
      </p>

      <div className="mt-4 flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "midi"}
          onClick={() => setTab("midi")}
          className={
            tab === "midi"
              ? "rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white"
              : "rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-400 hover:text-white"
          }
        >
          Catalogo MIDI
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "youtube"}
          onClick={() => setTab("youtube")}
          className={
            tab === "youtube"
              ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
              : "rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-400 hover:text-white"
          }
        >
          YouTube
        </button>
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}

      {tab === "midi" && (
        <>
          <label className="mt-4 flex flex-col gap-1 text-sm">
            <span className="text-zinc-500">Cerca nel catalogo</span>
            <input
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-fuchsia-500/30 focus:ring-2"
              placeholder="Titolo o artista…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>

          {loading && <p className="mt-3 text-sm text-zinc-500">Caricamento catalogo…</p>}

          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {filtered.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{s.title}</p>
                  <p className="truncate text-sm text-zinc-400">{s.artist}</p>
                  {s.duration != null && (
                    <p className="text-xs text-zinc-600">{formatDuration(s.duration)}</p>
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
          </ul>

          {!loading && filtered.length === 0 && (
            <p className="mt-4 text-center text-sm text-zinc-500">
              Nessun brano trovato. L&apos;host deve caricare i MIDI da /admin → catalogo.
            </p>
          )}
        </>
      )}

      {tab === "youtube" && (
        <>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void searchYt();
            }}
          >
            <input
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-2"
              placeholder="Cerca su YouTube (titolo, artista, karaoke…)"
              value={ytQuery}
              onChange={(e) => setYtQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={ytSearching || ytQuery.trim().length < 2}
              className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {ytSearching ? "…" : "Cerca"}
            </button>
          </form>
          <p className="mt-2 text-xs text-zinc-600">
            Le richieste YouTube vanno approvate dall&apos;host prima di entrare in coda.
          </p>

          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {ytResults.map((r) => (
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
                      {r.title}
                    </p>
                    <p className="truncate text-sm text-zinc-400">
                      {r.channel}
                      {r.duration != null && (
                        <span className="text-zinc-600"> · {formatDuration(r.duration)}</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={bookingId === r.id}
                    onClick={() => void bookYt(r)}
                    className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {bookingId === r.id ? "…" : "Richiedi"}
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

          {ytSearched && !ytSearching && ytResults.length === 0 && (
            <p className="mt-4 text-center text-sm text-zinc-500">Nessun risultato.</p>
          )}
        </>
      )}
    </div>
  );
}
