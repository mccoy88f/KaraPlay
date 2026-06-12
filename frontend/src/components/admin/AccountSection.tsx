import { useCallback, useEffect, useState } from "react";

const base = import.meta.env.VITE_API_URL ?? "";

type AdminMe = { id: string; username: string; role: "SUPERADMIN" | "ADMIN" };

type AdminUserRow = {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  _count: { events: number };
};

type CookiesStatus = {
  configured: boolean;
  size?: number;
  mtime?: string;
  fallback?: string | null;
};

type Props = {
  me: AdminMe;
  authHeader: () => Record<string, string>;
};

export function AccountSection({ me, authHeader }: Props) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // cambio password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  // cookies personali
  const [cookies, setCookies] = useState<CookiesStatus | null>(null);

  // gestione utenti (solo super admin)
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newUserPw, setNewUserPw] = useState("");
  const [userBusy, setUserBusy] = useState(false);

  const loadCookies = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/youtube/cookies-status`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCookies(data as CookiesStatus);
    } catch {
      setCookies(null);
    }
  }, [authHeader]);

  const loadUsers = useCallback(async () => {
    if (me.role !== "SUPERADMIN") return;
    try {
      const res = await fetch(`${base}/api/admin/users`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setUsers(((data as { users: AdminUserRow[] }).users ?? []));
    } catch {
      /* sezione resta vuota */
    }
  }, [authHeader, me.role]);

  useEffect(() => {
    void loadCookies();
    void loadUsers();
  }, [loadCookies, loadUsers]);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setPwBusy(true);
    try {
      const res = await fetch(`${base}/api/admin/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? "Cambio password fallito");
        return;
      }
      setMsg("Password aggiornata.");
      setCurrentPw("");
      setNewPw("");
    } finally {
      setPwBusy(false);
    }
  }

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
    setMsg("Cookies personali salvati: valgono per ricerca e download delle tue serate.");
    await loadCookies();
  }

  async function deleteCookies() {
    setErr(null);
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

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setUserBusy(true);
    try {
      const res = await fetch(`${base}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ username: newUsername.trim(), password: newUserPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? "Creazione fallita");
        return;
      }
      setMsg(`Admin «${newUsername.trim()}» creato: può gestire le sue serate da questo stesso pannello.`);
      setNewUsername("");
      setNewUserPw("");
      await loadUsers();
    } finally {
      setUserBusy(false);
    }
  }

  async function deleteUser(u: AdminUserRow) {
    if (!window.confirm(`Eliminare l'admin «${u.username}»? Le sue serate passeranno al super admin.`)) return;
    setErr(null);
    const res = await fetch(`${base}/api/admin/users/${encodeURIComponent(u.id)}`, {
      method: "DELETE",
      headers: { ...authHeader() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Eliminazione fallita");
      return;
    }
    await loadUsers();
  }

  return (
    <div className="space-y-6">
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {err && <p className="text-sm text-red-400">{err}</p>}

      <section className="kg-card p-5 md:p-6">
        <h2 className="font-display text-lg font-semibold text-white">
          {me.username}{" "}
          <span
            className={
              me.role === "SUPERADMIN"
                ? "ml-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-0.5 align-middle text-xs text-fuchsia-200"
                : "ml-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-0.5 align-middle text-xs text-cyan-200"
            }
          >
            {me.role === "SUPERADMIN" ? "super admin" : "admin"}
          </span>
        </h2>

        <form onSubmit={changePassword} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-44 flex-col gap-1 text-sm">
            <span className="text-zinc-400">Password attuale</span>
            <input
              type="password"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="flex min-w-44 flex-col gap-1 text-sm">
            <span className="text-zinc-400">Nuova password (min 6)</span>
            <input
              type="password"
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>
          <button
            type="submit"
            disabled={pwBusy || newPw.length < 6 || !currentPw}
            className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40"
          >
            {pwBusy ? "…" : "Cambia password"}
          </button>
        </form>
      </section>

      <section className="kg-card p-5 md:p-6">
        <h2 className="font-display text-lg font-semibold text-white">I tuoi cookies YouTube</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Personali: valgono per la ricerca e il download <strong className="text-zinc-300">delle tue serate</strong>.
          Servono solo se YouTube blocca le richieste dal server. Esporta i cookie in formato{" "}
          <strong className="text-zinc-300">Netscape</strong> da un account secondario (estensione tipo
          &quot;Get cookies.txt LOCALLY&quot; mentre sei loggato su youtube.com).
        </p>

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

      {me.role === "SUPERADMIN" && (
        <section className="kg-card p-5 md:p-6">
          <h2 className="font-display text-lg font-semibold text-white">Admin delle serate</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Ogni admin entra da <code className="rounded bg-zinc-800 px-1 text-cyan-300">/admin</code> con le sue
            credenziali, gestisce solo le <strong className="text-zinc-300">sue</strong> serate e i suoi cookies.
            Non può toccare catalogo MIDI, soundfont o impostazioni del server.
          </p>

          <form onSubmit={createUser} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-40 flex-col gap-1 text-sm">
              <span className="text-zinc-400">Nome utente</span>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="dj-marco"
                required
              />
            </label>
            <label className="flex min-w-40 flex-col gap-1 text-sm">
              <span className="text-zinc-400">Password (min 6)</span>
              <input
                type="password"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                value={newUserPw}
                onChange={(e) => setNewUserPw(e.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <button
              type="submit"
              disabled={userBusy || !newUsername.trim() || newUserPw.length < 6}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              {userBusy ? "…" : "+ Crea admin"}
            </button>
          </form>

          <ul className="mt-5 space-y-2">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-medium text-white">
                  {u.username}
                  {u.role === "SUPERADMIN" && (
                    <span className="ml-2 rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] uppercase text-fuchsia-200">
                      super
                    </span>
                  )}
                </span>
                <span className="text-xs text-zinc-600">
                  {u._count.events} {u._count.events === 1 ? "serata" : "serate"}
                </span>
                {u.role !== "SUPERADMIN" && (
                  <button
                    type="button"
                    onClick={() => void deleteUser(u)}
                    className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-200 hover:bg-red-900/50"
                  >
                    Elimina
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
