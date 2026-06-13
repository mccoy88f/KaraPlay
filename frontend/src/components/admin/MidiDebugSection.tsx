import { useCallback, useState } from "react";
import { useI18n } from "../../i18n/context";

const base = import.meta.env.VITE_API_URL ?? "";

type Props = {
  authHeader: () => Record<string, string>;
};

export function MidiDebugSection({ authHeader }: Props) {
  const { t } = useI18n();
  const [songId, setSongId] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [logText, setLogText] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runDebugCatalog = useCallback(async () => {
    const id = songId.trim();
    if (!id) {
      setErr(t("admin.midiDebug.songIdRequired"));
      return;
    }
    setErr(null);
    setLogText(null);
    setMeta(null);
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/admin/songs/${encodeURIComponent(id)}/midi-debug`, {
        headers: { ...authHeader() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? t("admin.midiDebug.analysisFailed"));
        return;
      }
      const d = data as {
        song?: { id: string; title: string; artist: string };
        midi?: { logLines: string[] };
      };
      if (d.song) {
        setMeta(`${d.song.title} — ${d.song.artist} (${d.song.id})`);
      }
      setLogText((d.midi?.logLines ?? []).join("\n"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("admin.midiDebug.networkError"));
    } finally {
      setLoading(false);
    }
  }, [authHeader, songId, t]);

  const runDebugUrl = useCallback(async () => {
    const u = remoteUrl.trim();
    if (!u) {
      setErr(t("admin.midiDebug.urlRequired"));
      return;
    }
    setErr(null);
    setLogText(null);
    setMeta(null);
    setLoading(true);
    try {
      const res = await fetch(
        `${base}/api/admin/midi-debug/by-url?url=${encodeURIComponent(u)}`,
        { headers: { ...authHeader() } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? t("admin.midiDebug.analysisFailed"));
        return;
      }
      const d = data as { sourceUrl?: string; midi?: { logLines: string[] } };
      if (d.sourceUrl) setMeta(d.sourceUrl);
      setLogText((d.midi?.logLines ?? []).join("\n"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("admin.midiDebug.networkError"));
    } finally {
      setLoading(false);
    }
  }, [authHeader, remoteUrl, t]);

  return (
    <section id="midi-debug" className="kg-card mt-8 scroll-mt-24 p-6 md:p-8">
      <h2 className="font-display text-lg font-semibold text-white">{t("admin.midiDebug.title")}</h2>
      <p className="mt-2 text-sm text-zinc-400">{t("admin.midiDebug.intro")}</p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t("admin.midiDebug.fromCatalog")}</p>
          <label className="mt-2 block text-sm text-zinc-400">
            {t("admin.midiDebug.songIdLabel")}
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none"
              value={songId}
              onChange={(e) => setSongId(e.target.value)}
              placeholder={t("admin.midiDebug.songIdPlaceholder")}
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runDebugCatalog()}
            className="mt-3 rounded-lg bg-amber-600/90 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-40"
          >
            {loading ? t("admin.midiDebug.analyzing") : t("admin.midiDebug.generateLog")}
          </button>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t("admin.midiDebug.fromUrl")}</p>
          <label className="mt-2 block text-sm text-zinc-400">
            {t("admin.midiDebug.urlLabel")}
            <input
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder={t("admin.midiDebug.urlPlaceholder")}
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runDebugUrl()}
            className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/20 disabled:opacity-40"
          >
            {loading ? t("admin.midiDebug.analyzing") : t("admin.midiDebug.generateLogUrl")}
          </button>
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}

      {meta && (
        <p className="mt-4 text-sm text-zinc-400">
          {t("admin.midiDebug.source")} <span className="text-zinc-200">{meta}</span>
        </p>
      )}

      {logText && (
        <pre className="mt-4 max-h-[32rem] overflow-auto rounded-xl border border-zinc-800 bg-black/50 p-4 text-left text-xs leading-relaxed text-amber-100/90">
          {logText}
        </pre>
      )}
    </section>
  );
}
