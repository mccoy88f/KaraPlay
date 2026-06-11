import { useEffect, useMemo, useState } from "react";
import { apiBookMidi, apiSearchSongs, getStoredEvent, type SongDto } from "../api/client";
import { getSoundfontBank } from "../lib/soundfontBanks";

export function BookCatalog() {
  const event = getStoredEvent();
  const bankLabel = event?.soundfontBankId
    ? getSoundfontBank(event.soundfontBankId).shortLabel
    : null;
  const [q, setQ] = useState("");
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}

      <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
        {filtered.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium text-white">{s.title}</p>
              <p className="text-sm text-zinc-400">{s.artist}</p>
              {s.duration != null && (
                <p className="text-xs text-zinc-600">{Math.floor(s.duration / 60)}:{String(s.duration % 60).padStart(2, "0")}</p>
              )}
            </div>
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
    </div>
  );
}
