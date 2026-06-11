import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiGetEvent, apiJoin, setStoredEvent, setStoredNickname, setStoredToken } from "../api/client";

export function Join() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [nickname, setNickname] = useState("");
  // PIN precompilato dal QR code sul display (/join/enter?pin=...).
  const [pin, setPin] = useState(() => searchParams.get("pin") ?? "");
  const [preview, setPreview] = useState<{ name: string; location: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePreviewPin() {
    if (pin.trim().length < 6) return;
    setError(null);
    setLoading(true);
    try {
      const ev = (await apiGetEvent(pin.trim())) as {
        name: string;
        location: string;
      };
      setPreview({ name: ev.name, location: ev.location });
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiJoin(nickname.trim(), pin.trim());
      setStoredToken(res.token);
      setStoredEvent(res.event);
      setStoredNickname(res.user.nickname);
      navigate("/join", { replace: true, state: { joined: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kg-page-bg flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <header className="mb-8 text-center">
          <Link to="/join" className="text-xs uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-300">
            ← Torna indietro
          </Link>
          <p className="font-display mt-6 text-xs uppercase tracking-[0.35em] text-fuchsia-400/90">Accesso</p>
          <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white">Entra nella serata</h1>
          <p className="mt-3 text-sm text-zinc-400">PIN della serata e il nome che vedranno sul palco.</p>
        </header>

        <form
          onSubmit={handleJoin}
          className="kg-card flex flex-col gap-5 p-6 shadow-2xl shadow-black/50 md:p-8"
        >
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-400">PIN serata</span>
            <input
              className="kg-input font-mono text-lg tracking-[0.2em]"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onBlur={handlePreviewPin}
              placeholder="••••••"
              inputMode="numeric"
              autoComplete="off"
            />
          </label>

          {preview && (
            <div className="rounded-xl border border-fuchsia-500/35 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-100">
              <p className="font-display font-semibold">{preview.name}</p>
              <p className="mt-1 text-fuchsia-200/80">{preview.location}</p>
            </div>
          )}

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-400">Nickname</span>
            <input
              className="kg-input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Come ti chiami sul palco?"
              maxLength={40}
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || nickname.trim().length === 0 || pin.trim().length < 4}
            className="font-display mt-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-fuchsia-500 px-4 py-4 font-semibold text-white transition hover:from-fuchsia-500 hover:to-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Connessione…" : "Entra in sala"}
          </button>
        </form>
      </div>
    </div>
  );
}
