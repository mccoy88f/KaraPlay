import { useRef, useState } from "react";
import JSZip from "jszip";
import { extractMidiMeta } from "../../lib/midiMeta";

const base = import.meta.env.VITE_API_URL ?? "";

type RowStatus = "in corso" | "ok" | "saltato" | "errore";

type LogRow = {
  file: string;
  status: RowStatus;
  title?: string;
  artist?: string;
  year?: number | null;
  genre?: string | null;
  note?: string;
};

type Props = {
  authHeader: () => Record<string, string>;
  /** Nomi file (minuscoli) già in catalogo: si saltano per non duplicare. */
  existingFileNames: string[];
  /** Chiamata a fine import per ricaricare la tabella del catalogo. */
  onDone: () => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function statusBadge(s: RowStatus): string {
  switch (s) {
    case "ok":
      return "text-emerald-400";
    case "saltato":
      return "text-amber-300/90";
    case "errore":
      return "text-red-400";
    default:
      return "text-zinc-400";
  }
}

/**
 * Importazione MIDI massiva: uno zip con dentro .mid/.midi/.kar.
 * Ogni file viene analizzato come nel caricamento singolo (titolo/artista/anno dai
 * metadati, lookup online opzionale per genere/anno) e caricato nel catalogo,
 * con un log riga per riga. I dati si correggono dopo, col ✏️ della tabella.
 */
export function MidiBulkImport({ authHeader, existingFileNames, onDone }: Props) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [running, setRunning] = useState(false);
  const [useLookup, setUseLookup] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function patchRow(idx: number, patch: Partial<LogRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function runImport(zipFile: File) {
    setRunning(true);
    setRows([]);
    setProgress(null);
    try {
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.values(zip.files).filter(
        (f) => !f.dir && /\.(mid|midi|kar)$/i.test(f.name) && !f.name.includes("__MACOSX")
      );
      if (entries.length === 0) {
        setRows([{ file: zipFile.name, status: "errore", note: "Nessun .mid/.kar nello zip" }]);
        return;
      }

      const existing = new Set(existingFileNames);
      setProgress({ done: 0, total: entries.length });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const name = entry.name.split("/").pop() ?? entry.name;
        setRows((prev) => [...prev, { file: name, status: "in corso" }]);
        const idx = i;

        try {
          const buf = await entry.async("arraybuffer");
          const meta = extractMidiMeta(buf, name);
          const title = meta.title || name.replace(/\.(mid|midi|kar)$/i, "");
          // l'upload richiede un artista: si corregge dopo col ✏️ in tabella
          const artist = meta.artist || "Sconosciuto";
          let year = meta.year;
          let genre: string | null = null;
          let coverUrl: string | null = null;

          if (existing.has(name.toLowerCase())) {
            patchRow(idx, { status: "saltato", title, artist, year, note: "già in catalogo" });
            setProgress({ done: i + 1, total: entries.length });
            continue;
          }

          if (useLookup) {
            try {
              const qs = `title=${encodeURIComponent(title)}&artist=${encodeURIComponent(
                artist === "Sconosciuto" ? "" : artist
              )}`;
              const r = await fetch(`${base}/api/admin/songs-meta-lookup?${qs}`, {
                headers: { ...authHeader() },
              });
              if (r.ok) {
                const d = (await r.json()) as {
                  genre?: string | null;
                  year?: number | null;
                  coverUrl?: string | null;
                };
                genre = d.genre ?? null;
                if (!year && d.year) year = d.year;
                coverUrl = d.coverUrl ?? null;
              }
              // iTunes gradisce un ritmo gentile
              await sleep(350);
            } catch {
              /* senza lookup si importa comunque */
            }
          }

          const fd = new FormData();
          fd.append("title", title);
          fd.append("artist", artist);
          if (year != null) fd.append("year", String(year));
          if (genre) fd.append("genre", genre);
          if (coverUrl) fd.append("coverUrl", coverUrl);
          fd.append("midi", new File([buf], name, { type: "audio/midi" }));

          const res = await fetch(`${base}/api/admin/songs/upload`, {
            method: "POST",
            headers: { ...authHeader() },
            body: fd,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            patchRow(idx, {
              status: "errore",
              title,
              artist,
              note: (data as { error?: string }).error ?? `HTTP ${res.status}`,
            });
          } else {
            existing.add(name.toLowerCase());
            patchRow(idx, {
              status: "ok",
              title,
              artist,
              year,
              genre,
              note: artist === "Sconosciuto" ? "artista da correggere" : undefined,
            });
          }
        } catch (e) {
          patchRow(idx, { status: "errore", note: e instanceof Error ? e.message : "file illeggibile" });
        }
        setProgress({ done: i + 1, total: entries.length });
      }
    } catch (e) {
      setRows([{ file: zipFile.name, status: "errore", note: e instanceof Error ? e.message : "zip illeggibile" }]);
    } finally {
      setRunning(false);
      if (inputRef.current) inputRef.current.value = "";
      onDone();
    }
  }

  const okCount = rows.filter((r) => r.status === "ok").length;
  const skipCount = rows.filter((r) => r.status === "saltato").length;
  const errCount = rows.filter((r) => r.status === "errore").length;

  return (
    <div className="mt-6 rounded-xl border border-cyan-500/25 bg-zinc-950/50 p-4 md:p-5">
      <h3 className="font-display text-base font-semibold text-white">📦 Importazione MIDI massiva</h3>
      <p className="mt-1 text-sm text-zinc-400">
        Carica uno <strong className="text-zinc-300">zip</strong> con dentro file{" "}
        <code className="rounded bg-zinc-800 px-1">.mid</code>/<code className="rounded bg-zinc-800 px-1">.kar</code>:
        ogni file viene analizzato (titolo, artista, anno dai metadati) e importato in automatico, senza
        compilare nulla. I dettagli si correggono dopo, col ✏️ in tabella.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label
          className={`cursor-pointer rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 ${
            running ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {running ? "Importazione in corso…" : "Scegli file .zip"}
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            disabled={running}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void runImport(f);
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={useLookup}
            onChange={(e) => setUseLookup(e.target.checked)}
            disabled={running}
            className="accent-cyan-500"
          />
          cerca anche genere/anno online (più lento)
        </label>
      </div>

      {progress && (
        <p className="mt-4 text-sm text-zinc-300">
          Elaborati <span className="font-mono">{progress.done}/{progress.total}</span>
          <span className="ml-3 text-emerald-400">✓ {okCount}</span>
          <span className="ml-2 text-amber-300/90">↷ {skipCount}</span>
          <span className="ml-2 text-red-400">✗ {errCount}</span>
          {running && <span className="ml-3 animate-pulse text-zinc-500">…</span>}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="sticky top-0 bg-zinc-950">
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="px-2 py-1.5">File</th>
                <th className="px-2 py-1.5">Esito</th>
                <th className="px-2 py-1.5">Titolo</th>
                <th className="px-2 py-1.5">Artista</th>
                <th className="px-2 py-1.5">Anno</th>
                <th className="px-2 py-1.5">Genere / note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-zinc-800/60">
                  <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono" title={r.file}>
                    {r.file}
                  </td>
                  <td className={`px-2 py-1.5 font-medium ${statusBadge(r.status)}`}>{r.status}</td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5" title={r.title}>
                    {r.title ?? "—"}
                  </td>
                  <td className="max-w-[9rem] truncate px-2 py-1.5" title={r.artist}>
                    {r.artist ?? "—"}
                  </td>
                  <td className="px-2 py-1.5">{r.year ?? "—"}</td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5 text-zinc-500" title={r.note ?? r.genre ?? undefined}>
                    {[r.genre, r.note].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
