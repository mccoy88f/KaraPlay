import { useRef, useState } from "react";
import JSZip from "jszip";
import { extractMidiMeta } from "../../lib/midiMeta";
import { useI18n } from "../../i18n/context";

const base = import.meta.env.VITE_API_URL ?? "";

type RowStatus = "running" | "ok" | "skipped" | "error";

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
  existingFileNames: string[];
  onDone: () => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Importazione MIDI massiva: uno zip con dentro .mid/.midi/.kar.
 */
export function MidiBulkImport({ authHeader, existingFileNames, onDone }: Props) {
  const { t } = useI18n();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [running, setRunning] = useState(false);
  const [useLookup, setUseLookup] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function statusLabel(s: RowStatus): string {
    if (s === "running") return t("admin.bulkImport.statusRunning");
    if (s === "ok") return t("admin.bulkImport.statusOk");
    if (s === "skipped") return t("admin.bulkImport.statusSkipped");
    return t("admin.bulkImport.statusError");
  }

  function statusBadge(s: RowStatus): string {
    switch (s) {
      case "ok":
        return "text-emerald-400";
      case "skipped":
        return "text-amber-300/90";
      case "error":
        return "text-red-400";
      default:
        return "text-zinc-400";
    }
  }

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
        setRows([{ file: zipFile.name, status: "error", note: t("admin.bulkImport.noMidiInZip") }]);
        return;
      }

      const existing = new Set(existingFileNames);
      setProgress({ done: 0, total: entries.length });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const name = entry.name.split("/").pop() ?? entry.name;
        setRows((prev) => [...prev, { file: name, status: "running" }]);
        const idx = i;

        try {
          const buf = await entry.async("arraybuffer");
          const meta = extractMidiMeta(buf, name);
          const title = meta.title || name.replace(/\.(mid|midi|kar)$/i, "");
          const artist = meta.artist || t("admin.bulkImport.unknownArtist");
          let year = meta.year;
          let genre: string | null = null;
          let coverUrl: string | null = null;

          if (existing.has(name.toLowerCase())) {
            patchRow(idx, {
              status: "skipped",
              title,
              artist,
              year,
              note: t("admin.bulkImport.alreadyInCatalog"),
            });
            setProgress({ done: i + 1, total: entries.length });
            continue;
          }

          if (useLookup) {
            try {
              const qs = `title=${encodeURIComponent(title)}&artist=${encodeURIComponent(
                artist === t("admin.bulkImport.unknownArtist") ? "" : artist
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
              status: "error",
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
              note:
                artist === t("admin.bulkImport.unknownArtist")
                  ? t("admin.bulkImport.fixArtist")
                  : undefined,
            });
          }
        } catch (e) {
          patchRow(idx, { status: "error", note: e instanceof Error ? e.message : "?" });
        }
        setProgress({ done: i + 1, total: entries.length });
      }
    } catch (e) {
      setRows([{ file: zipFile.name, status: "error", note: e instanceof Error ? e.message : "?" }]);
    } finally {
      setRunning(false);
      if (inputRef.current) inputRef.current.value = "";
      onDone();
    }
  }

  const okCount = rows.filter((r) => r.status === "ok").length;
  const skipCount = rows.filter((r) => r.status === "skipped").length;
  const errCount = rows.filter((r) => r.status === "error").length;

  return (
    <div className="mt-6 rounded-xl border border-cyan-500/25 bg-zinc-950/50 p-4 md:p-5">
      <h3 className="font-display text-base font-semibold text-white">{t("admin.bulkImport.title")}</h3>
      <p className="mt-1 text-sm text-zinc-400">{t("admin.bulkImport.intro")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label
          className={`cursor-pointer rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 ${
            running ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {running ? t("admin.bulkImport.running") : t("admin.bulkImport.chooseZip")}
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
          {t("admin.bulkImport.lookupLabel")}
        </label>
      </div>

      {progress && (
        <p className="mt-4 text-sm text-zinc-300">
          {t("admin.bulkImport.progress", { done: progress.done, total: progress.total })}
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
                <th className="px-2 py-1.5">{t("admin.bulkImport.colFile")}</th>
                <th className="px-2 py-1.5">{t("admin.bulkImport.colStatus")}</th>
                <th className="px-2 py-1.5">{t("admin.bulkImport.colTitle")}</th>
                <th className="px-2 py-1.5">{t("admin.bulkImport.colArtist")}</th>
                <th className="px-2 py-1.5">{t("admin.bulkImport.colYear")}</th>
                <th className="px-2 py-1.5">{t("admin.bulkImport.colNotes")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-zinc-800/60">
                  <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono" title={r.file}>
                    {r.file}
                  </td>
                  <td className={`px-2 py-1.5 font-medium ${statusBadge(r.status)}`}>{statusLabel(r.status)}</td>
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
