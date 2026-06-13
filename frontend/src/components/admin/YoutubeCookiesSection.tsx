import { useCallback, useEffect, useState } from "react";

const base = import.meta.env.VITE_API_URL ?? "";

type CookiesStatus = {
  configured: boolean;
  size?: number;
  mtime?: string;
  fallback?: string | null;
};

type Props = {
  authHeader: () => Record<string, string>;
};

/** Cookies Netscape per yt-dlp: ricerca e download YouTube sul server. */
export function YoutubeCookiesSection({ authHeader }: Props) {
  const [cookies, setCookies] = useState<CookiesStatus | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadCookies = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/youtube/cookies-status`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCookies(data as CookiesStatus);
    } catch {
      setCookies(null);
    }
  }, [authHeader]);

  useEffect(() => {
    void loadCookies();
  }, [loadCookies]);

  async function uploadCookies(file: File | null) {
    if (!file) return;
    setErr(null);
    setMsg(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${base}/api/admin/youtube/cookies`, {
      method: "POST",
      headers: { ...authHeader() },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Upload fallito");
      return;
    }
    setMsg("Cookies salvati: yt-dlp li userà per ricerca e download delle tue serate.");
    await loadCookies();
  }

  async function deleteCookies() {
    setErr(null);
    setMsg(null);
    const res = await fetch(`${base}/api/admin/youtube/cookies`, {
      method: "DELETE",
      headers: { ...authHeader() },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr((data as { error?: string }).error ?? "Eliminazione fallita");
      return;
    }
    setMsg("Cookies personali rimossi.");
    await loadCookies();
  }

  return (
    <section className="kg-card p-5 md:p-6">
      <h2 className="font-display text-lg font-semibold text-white">Cookies YouTube (yt-dlp)</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Servono solo se YouTube blocca ricerca o download dal server. Esporta un file{" "}
        <strong className="text-zinc-300">cookies.txt</strong> in formato Netscape (estensione tipo
        &quot;Get cookies.txt LOCALLY&quot; mentre sei loggato su youtube.com). yt-dlp li passa con{" "}
        <code className="rounded bg-zinc-800 px-1 text-cyan-300">--cookies</code> quando presenti.
      </p>
      <p className="mt-2 text-sm text-zinc-500">
        Priorità: file personale dell&apos;admin della serata →{" "}
        <code className="text-zinc-400">YOUTUBE_COOKIES_PATH</code> → file condiviso legacy.
      </p>

      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      <p className="mt-3 text-sm">
        {cookies?.configured ? (
          <span className="text-emerald-400">
            ✓ Cookies caricati
            {cookies.mtime && <span className="text-zinc-500"> · {new Date(cookies.mtime).toLocaleString()}</span>}
          </span>
        ) : (
          <span className="text-zinc-500">
            Nessun cookie personale.
            {cookies?.fallback && <span> Si usa il ripiego {cookies.fallback}.</span>}
          </span>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20">
          Carica cookies.txt
          <input
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(e) => void uploadCookies(e.target.files?.[0] ?? null)}
          />
        </label>
        {cookies?.configured && (
          <button
            type="button"
            onClick={() => void deleteCookies()}
            className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Rimuovi
          </button>
        )}
      </div>
    </section>
  );
}
