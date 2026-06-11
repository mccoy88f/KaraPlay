import { startTransition, useCallback, useEffect, useState } from "react";

const base = import.meta.env.VITE_API_URL ?? "";

export type SongDto = {
  id: string;
  title: string;
  artist: string;
  source: string;
  midiPath: string | null;
  lrcPath: string | null;
  duration: number | null;
};

type Props = {
  authHeader: () => Record<string, string>;
};

export function MidiCatalogSection({ authHeader }: Props) {
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [language, setLanguage] = useState("");
  const [midiFile, setMidiFile] = useState<File | null>(null);
  const [lrcFile, setLrcFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSongs = useCallback(async () => {
    const res = await fetch(`${base}/api/songs`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setSongs((data as { songs: SongDto[] }).songs ?? []);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadSongs();
    });
  }, [loadSongs]);

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
    setMidiFile(null);
    setLrcFile(null);
    await loadSongs();
  }

  return (
    <section className="kg-card mt-8 p-6 md:p-8">
      <h2 className="font-display text-lg font-semibold text-white">Catalogo MIDI karaoke</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Carica un file <code className="rounded bg-zinc-800 px-1">.mid</code> e opzionalmente un{" "}
        <code className="rounded bg-zinc-800 px-1">.lrc</code> per il testo sincronizzato sul Display.
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Lingua (opzionale)</span>
          <input
            className="kg-input"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="it"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="cursor-pointer rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20">
            File MIDI (.mid)
            <input
              type="file"
              accept=".mid,audio/midi"
              className="hidden"
              onChange={(e) => setMidiFile(e.target.files?.[0] ?? null)}
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
              <th className="py-2 pr-4">MIDI</th>
              <th className="py-2">LRC</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((s) => (
              <tr key={s.id} className="border-b border-zinc-800/80">
                <td className="py-2 pr-4 font-medium text-white">{s.title}</td>
                <td className="py-2 pr-4">{s.artist}</td>
                <td className="py-2 pr-4">{s.midiPath ? "sì" : "—"}</td>
                <td className="py-2">{s.lrcPath ? "sì" : "—"}</td>
              </tr>
            ))}
            {songs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-zinc-500">
                  Nessuna canzone in catalogo
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
