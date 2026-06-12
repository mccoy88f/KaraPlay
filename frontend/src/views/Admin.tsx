import { startTransition, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LiveConsole } from "../components/admin/LiveConsole";
import { MidiCatalogSection } from "../components/admin/MidiCatalogSection";
import { MidiDebugSection } from "../components/admin/MidiDebugSection";

const base = import.meta.env.VITE_API_URL ?? "";

/** Header opzionale per le fetch admin (nessun bearer fino al login admin vero). */
function emptyHeaders(): Record<string, string> {
  return {};
}

export function Admin() {
  const [tab, setTab] = useState<"console" | "tech">("console");
  const [cookiesStatus, setCookiesStatus] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authHeader = useCallback(() => emptyHeaders(), []);

  const loadCookiesStatus = useCallback(async () => {
    setError(null);
    const res = await fetch(`${base}/api/admin/youtube/cookies-status`, {
      headers: { ...authHeader() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        (data as { hint?: string }).hint ?? (data as { error?: string }).error ?? "Errore stato cookies"
      );
      return;
    }
    setCookiesStatus(data as Record<string, unknown>);
  }, [authHeader]);

  useEffect(() => {
    if (tab !== "tech") return;
    startTransition(() => {
      void loadCookiesStatus();
    });
  }, [tab, loadCookiesStatus]);

  async function uploadCookies(file: File | null) {
    if (!file) return;
    setMessage(null);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${base}/api/admin/youtube/cookies`, {
      method: "POST",
      headers: authHeader(),
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { error?: string }).error ?? "Upload fallito");
      return;
    }
    setMessage("File cookies salvato. yt-dlp userà questo file per YouTube.");
    await loadCookiesStatus();
  }

  async function deleteCookies() {
    setError(null);
    const res = await fetch(`${base}/api/admin/youtube/cookies`, {
      method: "DELETE",
      headers: { ...authHeader() },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? "Eliminazione fallita");
      return;
    }
    setMessage("File cookies predefinito rimosso (non influisce su YOUTUBE_COOKIES_PATH).");
    await loadCookiesStatus();
  }

  return (
    <div className="kg-page-bg min-h-dvh">
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-cyan-400/90">Host</p>
            <h1 className="font-display mt-1 text-2xl font-semibold text-white">La tua serata</h1>
          </div>
          <nav className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-950/70 p-1 text-sm" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "console"}
              onClick={() => setTab("console")}
              className={
                tab === "console"
                  ? "rounded-lg bg-fuchsia-600 px-4 py-2 font-medium text-white"
                  : "rounded-lg px-4 py-2 text-zinc-400 hover:text-white"
              }
            >
              🎤 Conduzione
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "tech"}
              onClick={() => setTab("tech")}
              className={
                tab === "tech"
                  ? "rounded-lg bg-zinc-700 px-4 py-2 font-medium text-white"
                  : "rounded-lg px-4 py-2 text-zinc-500 hover:text-white"
              }
            >
              🔧 Tecnico
            </button>
          </nav>
        </header>

        <main className="mt-6">
          {tab === "console" && <LiveConsole authHeader={authHeader} />}

          {tab === "tech" && (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">
                Cose da fare una volta sola, prima della serata: caricare le basi MIDI e, se serve, i cookies
                per YouTube. Durante la serata resta su <strong className="text-zinc-300">Conduzione</strong>.
              </p>

              <MidiCatalogSection authHeader={authHeader} />

              <MidiDebugSection authHeader={authHeader} />

              <section id="youtube" className="kg-card mt-8 scroll-mt-24 p-6 md:p-8">
                <h2 className="font-display text-lg font-semibold text-white">YouTube — cookies per yt-dlp</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Servono solo se la ricerca o il download video falliscono per autenticazione. Esporta i cookie
                  in formato <strong className="text-zinc-300">Netscape</strong>: il file viene salvato come{" "}
                  <code className="rounded bg-zinc-800 px-1 text-cyan-300">cookies/youtube.txt</code>. Alternativa:{" "}
                  <code className="rounded bg-zinc-800 px-1">YOUTUBE_COOKIES_PATH</code>.
                </p>

                {cookiesStatus && (
                  <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left text-xs text-zinc-300">
                    {JSON.stringify(cookiesStatus, null, 2)}
                  </pre>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20">
                    Carica cookies.txt
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      className="hidden"
                      onChange={(e) => void uploadCookies(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void deleteCookies()}
                    className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Rimuovi predefinito
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadCookiesStatus()}
                    className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    Aggiorna stato
                  </button>
                </div>
              </section>

              {message && <p className="mt-8 text-sm text-emerald-400">{message}</p>}
              {error && <p className="mt-8 text-sm text-red-400">{error}</p>}
            </div>
          )}
        </main>

        <footer className="mt-10 border-t border-zinc-800/80 pt-6 text-sm text-zinc-600">
          <Link to="/join" className="hover:text-zinc-400">
            Area pubblico
          </Link>
          <span className="mx-3 text-zinc-800">·</span>
          <Link to="/display" className="hover:text-zinc-400">
            Schermo sala
          </Link>
          <span className="mx-3 text-zinc-800">·</span>
          <Link to="/stage" className="hover:text-zinc-400">
            Palco
          </Link>
        </footer>
      </div>
    </div>
  );
}
