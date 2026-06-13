import { useRef, useState } from "react";
import JSZip from "jszip";
import { resolveMidiUploadMeta } from "../../lib/resolveMidiUploadMeta";
import { useI18n } from "../../i18n/context";

const base = import.meta.env.VITE_API_URL ?? "";

type RowStatus = "running" | "ok" | "skipped" | "error";

type LogRow = {
  file: string;
  status: RowStatus;
  songId?: string;
  title?: string;
  artist?: string;
  year?: number | null;
  genre?: string | null;
  note?: string;
};

type CancelPrompt = {
  importedIds: string[];
  processed: number;
  total: number;
};

type Props = {
  authHeader: () => Record<string, string>;
  existingFileNames: string[];
  onDone: () => void;
};

/**
 * Importazione MIDI massiva: uno zip con dentro .mid/.midi/.kar.
 */
export function MidiBulkImport({ authHeader, existingFileNames, onDone }: Props) {
  const { t } = useI18n();
  const unknownArtist = t("admin.bulkImport.unknownArtist");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [running, setRunning] = useState(false);
  const [useLookup, setUseLookup] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [cancelPrompt, setCancelPrompt] = useState<CancelPrompt | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoErr, setUndoErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);

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

  async function deleteImported(ids: string[]) {
    if (ids.length === 0) return;
    setUndoBusy(true);
    try {
      const res = await fetch(`${base}/api/admin/songs/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
    } finally {
      setUndoBusy(false);
    }
  }

  function finishImport() {
    setCancelPrompt(null);
    setUndoErr(null);
    onDone();
  }

  async function runImport(zipFile: File) {
    setRunning(true);
    setRows([]);
    setProgress(null);
    setCancelPrompt(null);
    cancelRef.current = false;
    setUndoErr(null);
    const importedIds: string[] = [];
    let interrupted = false;
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
      let processedCount = 0;

      for (let i = 0; i < entries.length; i++) {
        if (cancelRef.current) {
          interrupted = true;
          break;
        }

        const entry = entries[i];
        const name = entry.name.split("/").pop() ?? entry.name;
        setRows((prev) => [...prev, { file: name, status: "running" }]);
        const idx = i;

        try {
          const buf = await entry.async("arraybuffer");
          if (cancelRef.current) {
            interrupted = true;
            patchRow(idx, { status: "skipped", note: t("admin.bulkImport.cancelledRow") });
            break;
          }
          const meta = await resolveMidiUploadMeta(buf, name, {
            unknownArtist,
            useLookup,
            authHeader,
            base,
          });
          const title = meta.title;
          const artist = meta.artist;
          let year = meta.year;
          let genre = meta.genre;
          let coverUrl = meta.coverUrl;

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

          if (cancelRef.current) {
            interrupted = true;
            patchRow(idx, { status: "skipped", title, artist, note: t("admin.bulkImport.cancelledRow") });
            break;
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
            const songId = (data as { id?: string }).id;
            if (songId) importedIds.push(songId);
            existing.add(name.toLowerCase());
            patchRow(idx, {
              status: "ok",
              songId,
              title,
              artist,
              year,
              genre,
              note:
                artist === unknownArtist
                  ? t("admin.bulkImport.fixArtist")
                  : undefined,
            });
          }
        } catch (e) {
          patchRow(idx, { status: "error", note: e instanceof Error ? e.message : "?" });
        }
        processedCount = i + 1;
        setProgress({ done: processedCount, total: entries.length });
      }

      if (interrupted) {
        setCancelPrompt({
          importedIds: [...importedIds],
          processed: processedCount,
          total: entries.length,
        });
      }
    } catch (e) {
      setRows([{ file: zipFile.name, status: "error", note: e instanceof Error ? e.message : "?" }]);
    } finally {
      setRunning(false);
      if (inputRef.current) inputRef.current.value = "";
      if (!interrupted) onDone();
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
        {running && (
          <button
            type="button"
            onClick={() => {
              cancelRef.current = true;
            }}
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-200 hover:bg-red-500/20"
          >
            {t("admin.bulkImport.stopBtn")}
          </button>
        )}
      </div>

      {cancelPrompt && !running && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-100">{t("admin.bulkImport.cancelTitle")}</p>
          <p className="mt-2 text-sm text-amber-100/80">
            {t("admin.bulkImport.cancelHint", {
              imported: cancelPrompt.importedIds.length,
              processed: cancelPrompt.processed,
              total: cancelPrompt.total,
            })}
          </p>
          {undoErr && <p className="mt-2 text-sm text-red-300">{undoErr}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={undoBusy}
              onClick={() => finishImport()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {t("admin.bulkImport.keepBtn", { n: cancelPrompt.importedIds.length })}
            </button>
            <button
              type="button"
              disabled={undoBusy}
              onClick={() =>
                void (async () => {
                  setUndoErr(null);
                  try {
                    await deleteImported(cancelPrompt.importedIds);
                    finishImport();
                  } catch (e) {
                    setUndoErr(e instanceof Error ? e.message : t("admin.bulkImport.deleteFailed"));
                  }
                })()
              }
              className="rounded-lg border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-900/30 disabled:opacity-40"
            >
              {undoBusy ? t("admin.bulkImport.deleting") : t("admin.bulkImport.deleteAllBtn", { n: cancelPrompt.importedIds.length })}
            </button>
          </div>
        </div>
      )}

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
