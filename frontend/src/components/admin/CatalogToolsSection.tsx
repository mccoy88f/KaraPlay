import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmModal } from "../ConfirmModal";
import { resolveMidiUploadMeta } from "../../lib/resolveMidiUploadMeta";
import { readCatalogSelection, notifyCatalogChanged } from "../../lib/catalogSelection";
import { useI18n } from "../../i18n/context";
import type { SongDto } from "./MidiCatalogSection";

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

type Props = {
  authHeader: () => Record<string, string>;
};

export function CatalogToolsSection({ authHeader }: Props) {
  const { t } = useI18n();
  const unknownArtist = t("admin.catalogTools.unknownArtist");
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readCatalogSelection());
  const [rows, setRows] = useState<LogRow[]>([]);
  const [running, setRunning] = useState(false);
  const [useLookup, setUseLookup] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearModal, setClearModal] = useState(false);
  const [remetaAllModal, setRemetaAllModal] = useState(false);
  const cancelRef = useRef(false);

  const midiCatalogSongs = songs.filter((s) => s.source === "MIDI" && s.midiPath);
  const selectedMidiIds = selectedIds.filter((id) => midiCatalogSongs.some((s) => s.id === id));

  const loadSongs = useCallback(async () => {
    const res = await fetch(`${base}/api/admin/songs`, { headers: { ...authHeader() } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setSongs((data as { songs: SongDto[] }).songs ?? []);
  }, [authHeader]);

  useEffect(() => {
    void loadSongs();
  }, [loadSongs]);

  useEffect(() => {
    const onSelection = () => setSelectedIds(readCatalogSelection());
    const onCatalogChanged = () => void loadSongs();
    window.addEventListener("karaplay:catalog-selection", onSelection);
    window.addEventListener("karaplay:catalog-changed", onCatalogChanged);
    return () => {
      window.removeEventListener("karaplay:catalog-selection", onSelection);
      window.removeEventListener("karaplay:catalog-changed", onCatalogChanged);
    };
  }, [loadSongs]);

  function statusLabel(s: RowStatus): string {
    if (s === "running") return t("admin.catalogTools.statusRunning");
    if (s === "ok") return t("admin.catalogTools.statusOk");
    if (s === "skipped") return t("admin.catalogTools.statusSkipped");
    return t("admin.catalogTools.statusError");
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

  async function runRemeta(targets: SongDto[]) {
    if (targets.length === 0) return;
    setRunning(true);
    setRows([]);
    setProgress(null);
    setMsg(null);
    setErr(null);
    cancelRef.current = false;
    let interrupted = false;
    let processedCount = 0;

    try {
      setProgress({ done: 0, total: targets.length });

      for (let i = 0; i < targets.length; i++) {
        if (cancelRef.current) {
          interrupted = true;
          break;
        }

        const song = targets[i]!;
        const name = song.fileName ?? `${song.title}.mid`;
        setRows((prev) => [...prev, { file: name, status: "running", songId: song.id, title: song.title }]);
        const idx = i;

        try {
          const midiRes = await fetch(`${base}/api/media/song/${encodeURIComponent(song.id)}/midi`);
          if (!midiRes.ok) {
            patchRow(idx, {
              status: "error",
              title: song.title,
              artist: song.artist,
              note: `MIDI HTTP ${midiRes.status}`,
            });
            processedCount = i + 1;
            setProgress({ done: processedCount, total: targets.length });
            continue;
          }

          const buf = await midiRes.arrayBuffer();
          if (cancelRef.current) {
            interrupted = true;
            patchRow(idx, { status: "skipped", note: t("admin.catalogTools.cancelledRow") });
            break;
          }

          const meta = await resolveMidiUploadMeta(buf, name, {
            unknownArtist,
            useLookup,
            authHeader,
            base,
          });

          const body: Record<string, string | number | null> = {
            title: meta.title,
            artist: meta.artist,
          };
          if (meta.year != null) body.year = meta.year;
          if (useLookup && meta.genre) body.genre = meta.genre;
          if (useLookup && meta.coverUrl) body.coverUrl = meta.coverUrl;

          const putRes = await fetch(`${base}/api/admin/songs/${encodeURIComponent(song.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify(body),
          });
          const putData = await putRes.json().catch(() => ({}));
          if (!putRes.ok) {
            patchRow(idx, {
              status: "error",
              title: meta.title,
              artist: meta.artist,
              note: (putData as { error?: string }).error ?? `HTTP ${putRes.status}`,
            });
          } else {
            patchRow(idx, {
              status: "ok",
              songId: song.id,
              title: meta.title,
              artist: meta.artist,
              year: meta.year,
              genre: meta.genre,
              note: meta.artist === unknownArtist ? t("admin.catalogTools.fixArtist") : undefined,
            });
          }
        } catch (e) {
          patchRow(idx, { status: "error", note: e instanceof Error ? e.message : "?" });
        }

        processedCount = i + 1;
        setProgress({ done: processedCount, total: targets.length });
      }

      if (!interrupted) {
        await loadSongs();
        notifyCatalogChanged();
        setMsg(t("admin.catalogTools.remetaDone"));
      }
    } finally {
      setRunning(false);
    }
  }

  function startRemetaSelected() {
    const targets = midiCatalogSongs.filter((s) => selectedMidiIds.includes(s.id));
    if (targets.length === 0) {
      setRows([{ file: "—", status: "error", note: t("admin.catalogTools.remetaNoneSelected") }]);
      return;
    }
    void runRemeta(targets);
  }

  async function clearCatalog() {
    const ids = songs.map((s) => s.id);
    if (ids.length === 0) return;
    setClearBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`${base}/api/admin/songs/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!res.ok) {
        setErr(data.error ?? t("admin.catalogTools.deleteFailed"));
        return;
      }
      setClearModal(false);
      setMsg(t("admin.catalogTools.clearDone", { n: data.deleted ?? ids.length }));
      await loadSongs();
      notifyCatalogChanged();
    } finally {
      setClearBusy(false);
    }
  }

  const okCount = rows.filter((r) => r.status === "ok").length;
  const skipCount = rows.filter((r) => r.status === "skipped").length;
  const errCount = rows.filter((r) => r.status === "error").length;

  return (
    <section className="kg-card border border-fuchsia-500/20 p-5 md:p-6">
      <h2 className="font-display text-lg font-semibold text-white">{t("admin.catalogTools.title")}</h2>
      <p className="mt-2 text-sm text-zinc-400">{t("admin.catalogTools.intro")}</p>

      {msg && <p className="mt-4 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}

      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 md:p-5">
        <h3 className="font-display text-sm font-semibold text-white">{t("admin.catalogTools.remetaTitle")}</h3>
        <p className="mt-1 text-sm text-zinc-400">{t("admin.catalogTools.remetaIntro")}</p>
        <p className="mt-2 text-xs text-zinc-500">{t("admin.catalogTools.remetaSelectionHint", { n: selectedMidiIds.length })}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={useLookup}
              onChange={(e) => setUseLookup(e.target.checked)}
              disabled={running}
              className="accent-fuchsia-500"
            />
            {t("admin.catalogTools.lookupLabel")}
          </label>
          {running && (
            <button
              type="button"
              onClick={() => {
                cancelRef.current = true;
              }}
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/20"
            >
              {t("admin.catalogTools.stopBtn")}
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running || selectedMidiIds.length === 0}
            onClick={() => startRemetaSelected()}
            className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-100 hover:bg-fuchsia-500/20 disabled:opacity-40"
          >
            {t("admin.catalogTools.remetaSelectedBtn", { n: selectedMidiIds.length })}
          </button>
          <button
            type="button"
            disabled={running || midiCatalogSongs.length === 0}
            onClick={() => setRemetaAllModal(true)}
            className="rounded-xl border border-fuchsia-500/30 px-4 py-2 text-sm text-fuchsia-200/90 hover:bg-fuchsia-950/30 disabled:opacity-40"
          >
            {t("admin.catalogTools.remetaAllBtn", { n: midiCatalogSongs.length })}
          </button>
        </div>

        {progress && (
          <p className="mt-4 text-sm text-zinc-300">
            {t("admin.catalogTools.progress", { done: progress.done, total: progress.total })}
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
                  <th className="px-2 py-1.5">{t("admin.catalogTools.colFile")}</th>
                  <th className="px-2 py-1.5">{t("admin.catalogTools.colStatus")}</th>
                  <th className="px-2 py-1.5">{t("admin.catalogTools.colTitle")}</th>
                  <th className="px-2 py-1.5">{t("admin.catalogTools.colArtist")}</th>
                  <th className="px-2 py-1.5">{t("admin.catalogTools.colYear")}</th>
                  <th className="px-2 py-1.5">{t("admin.catalogTools.colNotes")}</th>
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

      <div className="mt-6 rounded-xl border border-red-500/20 bg-red-950/20 p-4 md:p-5">
        <h3 className="font-display text-sm font-semibold text-red-100">{t("admin.catalogTools.clearTitle")}</h3>
        <p className="mt-1 text-sm text-red-200/70">{t("admin.catalogTools.clearIntro")}</p>
        <p className="mt-2 text-xs text-zinc-500">
          {songs.length === 1
            ? t("admin.catalogTools.catalogCountOne")
            : t("admin.catalogTools.catalogCount", { n: songs.length })}
        </p>
        <button
          type="button"
          disabled={clearBusy || running || songs.length === 0}
          onClick={() => setClearModal(true)}
          className="mt-4 rounded-xl border border-red-500/50 bg-red-600/20 px-4 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-600/30 disabled:opacity-40"
        >
          {t("admin.catalogTools.clearBtn")}
        </button>
      </div>

      <ConfirmModal
        open={clearModal}
        title={t("admin.catalogTools.clearConfirmTitle")}
        description={t("admin.catalogTools.clearConfirmBody", { n: songs.length })}
        confirmLabel={clearBusy ? t("admin.catalogTools.deleting") : t("admin.catalogTools.clearConfirmBtn")}
        cancelLabel={t("admin.catalogTools.clearCancelBtn")}
        tone="danger"
        busy={clearBusy}
        onConfirm={() => void clearCatalog()}
        onCancel={() => {
          if (!clearBusy) setClearModal(false);
        }}
      />

      <ConfirmModal
        open={remetaAllModal}
        title={t("admin.catalogTools.remetaConfirmTitle")}
        description={t("admin.catalogTools.remetaConfirmAll", { n: midiCatalogSongs.length })}
        confirmLabel={t("admin.catalogTools.remetaConfirmBtn")}
        cancelLabel={t("admin.catalogTools.clearCancelBtn")}
        busy={running}
        onConfirm={() => {
          setRemetaAllModal(false);
          void runRemeta(midiCatalogSongs);
        }}
        onCancel={() => {
          if (!running) setRemetaAllModal(false);
        }}
      />
    </section>
  );
}
