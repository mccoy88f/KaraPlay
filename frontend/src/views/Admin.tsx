import { startTransition, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LiveQueueSection } from "../components/admin/LiveQueueSection";
import { MidiCatalogSection } from "../components/admin/MidiCatalogSection";
import { MidiDebugSection } from "../components/admin/MidiDebugSection";

const base = import.meta.env.VITE_API_URL ?? "";

/** Header opzionale per le fetch admin (nessun bearer fino al login admin vero). */
function emptyHeaders(): Record<string, string> {
  return {};
}

export function Admin() {
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
    startTransition(() => {
      void loadCookiesStatus();
    });
  }, [loadCookiesStatus]);

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

  const nav = [
    { href: "#accesso", label: "Accesso" },
    { href: "#catalog", label: "Catalogo MIDI" },
    { href: "#queue", label: "Coda live" },
    { href: "#midi-debug", label: "Debug MIDI" },
    { href: "#youtube", label: "YouTube" },
  ];

  return (
    <div className="kg-page-bg min-h-dvh">
      <div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-zinc-800/80 bg-zinc-950/50 px-4 py-6 backdrop-blur-md lg:border-b-0 lg:border-r lg:px-5">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-cyan-400/90">Host</p>
          <h1 className="font-display mt-2 text-lg font-semibold text-white">Pannello</h1>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Separato dal flusso <code className="text-zinc-400">/join</code>.
          </p>
          <nav className="mt-8 flex flex-col gap-1 text-sm">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-zinc-400 transition hover:bg-zinc-800/60 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-8 border-t border-zinc-800 pt-6 text-xs text-zinc-600">
            <Link to="/join" className="block hover:text-zinc-400">
              → Pubblico
            </Link>
            <Link to="/display" className="mt-2 block hover:text-zinc-400">
              → Display
            </Link>
          </div>
        </aside>

        <main className="px-4 py-8 md:px-10">
          <section id="accesso" className="kg-card scroll-mt-24 p-6 md:p-8">
            <h2 className="font-display text-lg font-semibold text-white">Accesso admin</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              In questa fase il pannello è <strong className="text-zinc-200">aperto senza token</strong>. In seguito
              aggiungeremo la registrazione / login come amministratori con email e password.
            </p>
          </section>

          <div id="catalog" className="scroll-mt-24">
            <MidiCatalogSection authHeader={authHeader} />
          </div>

          <div id="queue" className="scroll-mt-24">
            <LiveQueueSection authHeader={authHeader} />
          </div>

          <MidiDebugSection authHeader={authHeader} />

          <section id="youtube" className="kg-card mt-8 scroll-mt-24 p-6 md:p-8">
            <h2 className="font-display text-lg font-semibold text-white">YouTube — cookies per yt-dlp</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Esporta i cookie in formato <strong className="text-zinc-300">Netscape</strong>. Il file viene salvato
              come <code className="rounded bg-zinc-800 px-1 text-cyan-300">cookies/youtube.txt</code>. Alternativa:{" "}
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
        </main>
      </div>
    </div>
  );
}
