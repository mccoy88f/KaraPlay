import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LiveConsole } from "../components/admin/LiveConsole";
import { AdminBookSection } from "../components/admin/AdminBookSection";
import { AccountSection } from "../components/admin/AccountSection";
import { MidiCatalogSection } from "../components/admin/MidiCatalogSection";
import { MidiDebugSection } from "../components/admin/MidiDebugSection";
import { SoundfontAdminSection } from "../components/admin/SoundfontAdminSection";
import { YoutubeCookiesSection } from "../components/admin/YoutubeCookiesSection";
import { useI18n } from "../i18n/context";

const base = import.meta.env.VITE_API_URL ?? "";
const ADMIN_TOKEN_KEY = "karaoke_admin_jwt";

type AdminMe = { id: string; username: string; role: "SUPERADMIN" | "ADMIN" };

export function Admin() {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [me, setMe] = useState<AdminMe | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<"console" | "book" | "catalog" | "account" | "tech">("console");

  // login form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginErr, setLoginErr] = useState<string | null>(null);

  const authHeader = useCallback(
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // verifica del token salvato (scaduto/utente eliminato → si torna al login)
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setMe(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    void (async () => {
      try {
        const res = await fetch(`${base}/api/admin/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
          setToken(null);
          setMe(null);
        } else {
          setMe((data as { user: AdminMe }).user);
        }
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr(null);
    setLoginBusy(true);
    try {
      const res = await fetch(`${base}/api/admin/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginErr((data as { error?: string }).error ?? t("admin.loginFailed"));
        return;
      }
      const d = data as { token: string; user: AdminMe };
      localStorage.setItem(ADMIN_TOKEN_KEY, d.token);
      setToken(d.token);
      setMe(d.user);
      setPassword("");
    } finally {
      setLoginBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setMe(null);
    setTab("console");
  }

  if (checking) {
    return (
      <div className="kg-page-bg flex min-h-dvh items-center justify-center">
        <p className="text-sm text-zinc-500">{t("admin.checking")}</p>
      </div>
    );
  }

  if (!token || !me) {
    return (
      <div className="kg-page-bg flex min-h-dvh flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <header className="mb-8 text-center">
            <p className="font-display text-xs uppercase tracking-[0.35em] text-cyan-400/90">{t("admin.host")}</p>
            <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white">{t("admin.panelTitle")}</h1>
            <p className="mt-3 text-sm text-zinc-400">{t("admin.panelHint")}</p>
          </header>

          <form onSubmit={login} className="kg-card flex flex-col gap-4 p-6 shadow-2xl shadow-black/50">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-zinc-400">{t("admin.username")}</span>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none ring-cyan-500/30 focus:ring-2"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-zinc-400">{t("admin.password")}</span>
              <input
                type="password"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 outline-none ring-cyan-500/30 focus:ring-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {loginErr && <p className="text-sm text-red-400">{loginErr}</p>}

            <button
              type="submit"
              disabled={loginBusy || !username.trim() || !password}
              className="font-display mt-1 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-3 font-semibold text-white transition hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-40"
            >
              {loginBusy ? t("admin.loggingIn") : t("admin.login")}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-zinc-600">{t("admin.firstLogin")}</p>
          <p className="mt-4 text-center text-sm text-zinc-600">
            <Link to="/join" className="hover:text-zinc-400">
              {t("admin.publicArea")}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const isSuper = me.role === "SUPERADMIN";

  return (
    <div className="kg-page-bg min-h-dvh">
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-cyan-400/90">
              {isSuper ? t("admin.superAdmin") : t("admin.host")} · {me.username}
            </p>
            <h1 className="font-display mt-1 text-2xl font-semibold text-white">{t("admin.yourEvent")}</h1>
          </div>
          <nav className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/70 p-1 text-sm" role="tablist">
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
              {t("admin.tabs.console")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "book"}
              onClick={() => setTab("book")}
              className={
                tab === "book"
                  ? "rounded-lg bg-fuchsia-600 px-4 py-2 font-medium text-white"
                  : "rounded-lg px-4 py-2 text-zinc-400 hover:text-white"
              }
            >
              {t("admin.tabs.book")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "catalog"}
              onClick={() => setTab("catalog")}
              className={
                tab === "catalog"
                  ? "rounded-lg bg-zinc-700 px-4 py-2 font-medium text-white"
                  : "rounded-lg px-4 py-2 text-zinc-500 hover:text-white"
              }
            >
              {t("admin.tabs.catalog")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "account"}
              onClick={() => setTab("account")}
              className={
                tab === "account"
                  ? "rounded-lg bg-zinc-700 px-4 py-2 font-medium text-white"
                  : "rounded-lg px-4 py-2 text-zinc-500 hover:text-white"
              }
            >
              {t("admin.tabs.account")}
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
              {t("admin.tabs.tech")}
            </button>
          </nav>
        </header>

        <main className="mt-6">
          {tab === "console" && <LiveConsole authHeader={authHeader} />}

          {tab === "book" && <AdminBookSection authHeader={authHeader} adminUsername={me?.username} />}

          {tab === "catalog" && <MidiCatalogSection authHeader={authHeader} />}

          {tab === "account" && <AccountSection me={me} authHeader={authHeader} />}

          {tab === "tech" && (
            <div className="space-y-6">
              <p className="text-sm text-zinc-500">{t("admin.techIntro")}</p>

              <SoundfontAdminSection authHeader={authHeader} isSuper={isSuper} />

              <YoutubeCookiesSection authHeader={authHeader} />

              {isSuper && <MidiDebugSection authHeader={authHeader} />}
            </div>
          )}
        </main>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 pt-6 text-sm text-zinc-600">
          <div>
            <Link to="/join" className="hover:text-zinc-400">
              {t("admin.footer.public")}
            </Link>
            <span className="mx-3 text-zinc-800">·</span>
            <Link to="/display" className="hover:text-zinc-400">
              {t("admin.footer.display")}
            </Link>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:border-red-500/50 hover:text-red-300"
          >
            {t("admin.footer.logout", { user: me.username })}
          </button>
        </footer>
      </div>
    </div>
  );
}
