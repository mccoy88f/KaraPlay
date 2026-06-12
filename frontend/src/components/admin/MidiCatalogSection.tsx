import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { extractMidiMeta } from "../../lib/midiMeta";
import { MidiBulkImport } from "./MidiBulkImport";

const base = import.meta.env.VITE_API_URL ?? "";

export type SongDto = {
  id: string;
  title: string;
  artist: string;
  source: string;
  midiPath: string | null;
  lrcPath: string | null;
  duration: number | null;
  fileName?: string | null;
  year?: number | null;
  genre?: string | null;
  language?: string | null;
};

type Props = {
  authHeader: () => Record<string, string>;
};

export function MidiCatalogSection({ authHeader }: Props) {
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [language, setLanguage] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const lookupSeqRef = useRef(0);
  /** Brano in modifica (pannello sotto la tabella). */
  const [editing, setEditing] = useState<SongDto | null>(null);
  const [edit, setEdit] = useState({ title: "", artist: "", year: "", genre: "", language: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [midiFile, setMidiFile] = useState<File | null>(null);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Ultimi valori precompilati dal file: si sovrascrivono solo se l'utente non li ha toccati. */
  const autoFillRef = useRef<{ title: string; artist: string; year: string }>({ title: "", artist: "", year: "" });

  /** Alla scelta del file, titolo e artista si leggono dai metadati MIDI/.kar (modificabili). */
  async function onMidiPicked(f: File | null) {
    setMidiFile(f);
    if (!f) return;
    try {
      const meta = extractMidiMeta(await f.arrayBuffer(), f.name);
      setTitle((cur) => {
        if (meta.title && (cur.trim() === "" || cur === autoFillRef.current.title)) {
          autoFillRef.current.title = meta.title;
          return meta.title;
        }
        return cur;
      });
      setArtist((cur) => {
        if (meta.artist && (cur.trim() === "" || cur === autoFillRef.current.artist)) {
          autoFillRef.current.artist = meta.artist;
          return meta.artist;
        }
        return cur;
      });
      setYear((cur) => {
        const y = meta.year != null ? String(meta.year) : "";
        if (y && (cur.trim() === "" || cur === autoFillRef.current.year)) {
          autoFillRef.current.year = y;
          return y;
        }
        return cur;
      });
      if (meta.title || meta.artist) {
        setMsg("Titolo e artista letti dal file: controllali e correggi se serve.");
      }
    } catch {
      /* file illeggibile: i campi restano come sono */
    }
  }

  const loadSongs = useCallback(async () => {
    const res = await fetch(`${base}/api/admin/songs`, { headers: { ...authHeader() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setSongs((data as { songs: SongDto[] }).songs ?? []);
  }, [authHeader]);

  useEffect(() => {
    startTransition(() => {
      void loadSongs();
    });
  }, [loadSongs]);

  /** Genere/anno da iTunes (via backend): precompila i campi ancora vuoti. */
  const fetchMetaLookup = useCallback(
    async (
      lookupTitle: string,
      lookupArtist: string,
      onResult: (data: { genre?: string | null; year?: number | null }) => void,
      opts: { fillGenre: boolean; fillYear: boolean }
    ) => {
      if (!lookupTitle.trim() || (!opts.fillGenre && !opts.fillYear)) return;
      const seq = ++lookupSeqRef.current;
      setLookupBusy(true);
      setErr(null);
      try {
        const qs = `title=${encodeURIComponent(lookupTitle.trim())}&artist=${encodeURIComponent(lookupArtist.trim())}`;
        const res = await fetch(`${base}/api/admin/songs-meta-lookup?${qs}`, { headers: { ...authHeader() } });
        const data = (await res.json().catch(() => ({}))) as {
          genre?: string | null;
          year?: number | null;
          error?: string;
        };
        if (seq !== lookupSeqRef.current) return;
        if (!res.ok) {
          setErr(data.error ?? "Lookup non disponibile");
          return;
        }
        onResult(data);
        if (data.genre || data.year) {
          setMsg(`Trovato online: ${[data.genre, data.year].filter(Boolean).join(" · ")}`);
        }
      } finally {
        if (seq === lookupSeqRef.current) setLookupBusy(false);
      }
    },
    [authHeader]
  );

  /** Lookup automatico nel form di caricamento: genere se vuoto, anno solo se mancante. */
  useEffect(() => {
    const fillGenre = !genre.trim();
    const fillYear = !year.trim();
    if (!title.trim() || (!fillGenre && !fillYear)) return;
    const timer = window.setTimeout(() => {
      void fetchMetaLookup(
        title,
        artist,
        (data) => {
          if (data.genre && fillGenre) setGenre(data.genre);
          if (data.year && fillYear) setYear(String(data.year));
        },
        { fillGenre, fillYear }
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [title, artist, genre, year, fetchMetaLookup]);

  /** Lookup automatico nel pannello modifica. */
  useEffect(() => {
    if (!editing) return;
    const fillGenre = !edit.genre.trim();
    const fillYear = !edit.year.trim();
    if (!edit.title.trim() || (!fillGenre && !fillYear)) return;
    const timer = window.setTimeout(() => {
      void fetchMetaLookup(
        edit.title,
        edit.artist,
        (data) => {
          setEdit((cur) => ({
            ...cur,
            genre: data.genre && fillGenre ? data.genre : cur.genre,
            year: data.year && fillYear ? String(data.year) : cur.year,
          }));
        },
        { fillGenre, fillYear }
      );
    }, 700);
    return () => window.clearTimeout(timer);
  }, [editing, edit.title, edit.artist, edit.genre, edit.year, fetchMetaLookup]);

  function startEdit(s2: SongDto) {
    setEditing(s2);
    setEdit({
      title: s2.title,
      artist: s2.artist,
      year: s2.year != null ? String(s2.year) : "",
      genre: s2.genre ?? "",
      language: s2.language ?? "",
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    setErr(null);
    try {
      const y = edit.year.trim() ? Number.parseInt(edit.year.trim(), 10) : null;
      const res = await fetch(`${base}/api/admin/songs/${encodeURIComponent(editing.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          title: edit.title.trim(),
          artist: edit.artist.trim(),
          year: Number.isInteger(y) ? y : null,
          genre: edit.genre.trim() || null,
          language: edit.language.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? "Salvataggio fallito");
        return;
      }
      setMsg(`«${edit.title.trim()}» aggiornato.`);
      setEditing(null);
      await loadSongs();
    } finally {
      setEditBusy(false);
    }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !artist.trim() || !midiFile) {
      setErr("Titolo, artista e file .mid sono obbligatori");
      return;
    }
    setErr(null);
    setMsg(null);
    setLoading(true);
    const body = new FormData();
    body.append("title", title.trim());
    body.append("artist", artist.trim());
    if (language.trim()) body.append("language", language.trim());
    if (year.trim()) body.append("year", year.trim());
    if (genre.trim()) body.append("genre", genre.trim());
    body.append("midi", midiFile);
    if (lrcFile) body.append("lrc", lrcFile);
    const res = await fetch(`${base}/api/admin/songs/upload`, {
      method: "POST",
      headers: authHeader(),
      body,
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Upload fallito");
      return;
    }
    setMsg(`Caricata: ${(data as SongDto).title}`);
    setTitle("");
    setArtist("");
    setLanguage("");
    setYear("");
    setGenre("");
    autoFillRef.current = { title: "", artist: "", year: "" };
    setMidiFile(null);
    setLrcFile(null);
    await loadSongs();
  }

  return (
    <section className="kg-card mt-8 p-6 md:p-8">
      <h2 className="font-display text-lg font-semibold text-white">Il tuo catalogo MIDI karaoke</h2>
      <p className="mt-2 text-sm text-zinc-400">
        I brani che carichi qui sono visibili al pubblico di <strong className="text-zinc-300">tutte le tue
        serate</strong> (e solo delle tue). File <code className="rounded bg-zinc-800 px-1">.mid</code> +
        opzionale <code className="rounded bg-zinc-800 px-1">.lrc</code> per il testo sincronizzato.
      </p>

      <form onSubmit={(e) => void upload(e)} className="mt-6 flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Titolo</span>
            <input
              className="kg-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Artista</span>
            <input
              className="kg-input"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              required
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Lingua (opzionale)</span>
            <input
              className="kg-input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="it"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Anno (opzionale, letto dal file se presente)</span>
            <input
              className="kg-input"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="es. 2024"
              inputMode="numeric"
              maxLength={4}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
            <span className="text-zinc-400">Genere (opzionale)</span>
            <input
              className="kg-input"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="es. Pop, Rock…"
            />
          </label>
          {lookupBusy && (
            <p className="pb-2.5 text-xs text-cyan-300/80">Cerco genere/anno online…</p>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Genere e anno si cercano automaticamente da titolo e artista (iTunes) se i campi sono vuoti.
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="cursor-pointer rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20">
            File MIDI (.mid)
            <input
              type="file"
              accept=".mid,audio/midi"
              className="hidden"
              onChange={(e) => void onMidiPicked(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="cursor-pointer rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            LRC (opzionale)
            <input
              type="file"
              accept=".lrc,text/plain"
              className="hidden"
              onChange={(e) => setLrcFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {midiFile && <p className="text-xs text-zinc-500">MIDI: {midiFile.name}</p>}
        {lrcFile && <p className="text-xs text-zinc-500">LRC: {lrcFile.name}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-fit rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          {loading ? "Caricamento…" : "Carica nel catalogo"}
        </button>
      </form>

      {msg && <p className="mt-4 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="py-2 pr-4">Titolo</th>
              <th className="py-2 pr-4">Artista</th>
              <th className="py-2 pr-4">Anno</th>
              <th className="py-2 pr-4">Genere</th>
              <th className="py-2 pr-4">File</th>
              <th className="py-2 pr-4">LRC</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {songs.map((s) => (
              <tr key={s.id} className="border-b border-zinc-800/80">
                <td className="py-2 pr-4 font-medium text-white">{s.title}</td>
                <td className="py-2 pr-4">{s.artist}</td>
                <td className="py-2 pr-4">{s.year ?? "—"}</td>
                <td className="py-2 pr-4">{s.genre ?? "—"}</td>
                <td className="max-w-[14rem] truncate py-2 pr-4 font-mono text-xs text-zinc-500" title={s.fileName ?? undefined}>
                  {s.fileName ?? "—"}
                </td>
                <td className="py-2 pr-4">{s.lrcPath ? "sì" : "—"}</td>
                <td className="py-2">
                  <button
                    type="button"
                    title="Modifica titolo, artista, anno, genere"
                    onClick={() => startEdit(s)}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    ✏️
                  </button>
                </td>
              </tr>
            ))}
            {songs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-zinc-500">
                  Nessuna canzone in catalogo
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <MidiBulkImport
        authHeader={authHeader}
        existingFileNames={songs.map((s2) => (s2.fileName ?? "").toLowerCase()).filter(Boolean)}
        onDone={() => void loadSongs()}
      />

      {editing && (
        <form onSubmit={(e) => void saveEdit(e)} className="mt-6 rounded-xl border border-fuchsia-500/30 bg-zinc-950/60 p-4">
          <p className="text-sm font-medium text-fuchsia-200">Modifica «{editing.title}»</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Titolo</span>
              <input className="kg-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Artista</span>
              <input className="kg-input" value={edit.artist} onChange={(e) => setEdit({ ...edit, artist: e.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Anno</span>
              <input className="kg-input" value={edit.year} onChange={(e) => setEdit({ ...edit, year: e.target.value })} inputMode="numeric" maxLength={4} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Genere</span>
              <input className="kg-input" value={edit.genre} onChange={(e) => setEdit({ ...edit, genre: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-400">Lingua</span>
              <input className="kg-input" value={edit.language} onChange={(e) => setEdit({ ...edit, language: e.target.value })} placeholder="it" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={editBusy || !edit.title.trim() || !edit.artist.trim()} className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40">
              {editBusy ? "Salvo…" : "Salva modifiche"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
              Annulla
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
