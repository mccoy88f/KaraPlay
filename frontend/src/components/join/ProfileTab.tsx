import { useEffect, useState } from "react";
import {
  apiGetMyStats,
  apiRequestOtp,
  apiVerifyOtp,
  setStoredToken,
  type MyStats,
} from "../../api/client";
import { LanguageSettings } from "../LanguageSettings";
import { useI18n } from "../../i18n/context";

export function ProfileTab() {
  const { t } = useI18n();
  const [stats, setStats] = useState<MyStats | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const s = await apiGetMyStats();
      setStats(s);
      if (s.email) setEmail(s.email);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common.error"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestOtp() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      await apiRequestOtp(email.trim());
      setOtpSent(true);
      setMsg(t("profile.otpSent"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const res = await apiVerifyOtp(email.trim(), code.trim());
      setStoredToken(res.token);
      setMsg(t("profile.emailVerified"));
      setOtpSent(false);
      setCode("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-5 md:p-6">
      <LanguageSettings />

      <div>
        <h2 className="font-display text-lg font-semibold text-white">{t("profile.title")}</h2>

        {stats && (
          <>
            <p className="mt-2 text-sm text-zinc-400">
              {t("profile.nickname")}: <span className="font-medium text-white">{stats.nickname}</span>
              {stats.emailVerified && stats.email && (
                <span className="ml-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                  ✓ {stats.email}
                </span>
              )}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2 py-3">
                <p className="font-display text-2xl font-semibold text-white">{stats.performances}</p>
                <p className="mt-1 text-xs text-zinc-500">{t("profile.performances")}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2 py-3">
                <p className="font-display text-2xl font-semibold text-amber-300">
                  {stats.avgScore != null ? stats.avgScore.toFixed(1) : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{t("profile.avgScore")}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-2 py-3">
                <p className="font-display text-2xl font-semibold text-fuchsia-300">
                  {stats.bestScore != null ? stats.bestScore.toFixed(1) : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{t("profile.bestScore")}</p>
              </div>
            </div>
          </>
        )}

        {msg && <p className="mt-4 text-sm text-emerald-400">{msg}</p>}
        {err && <p className="mt-4 text-sm text-red-400">{err}</p>}

        {stats && !stats.emailVerified && (
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-sm font-medium text-zinc-200">{t("profile.linkEmail")}</p>
            <p className="mt-1 text-xs text-zinc-500">{t("profile.linkEmailHint")}</p>
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="email"
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none ring-fuchsia-500/30 focus:ring-2"
                placeholder="la-tua@email.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {!otpSent ? (
                <button
                  type="button"
                  disabled={busy || !email.includes("@")}
                  onClick={() => void requestOtp()}
                  className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-40"
                >
                  {busy ? "…" : t("profile.sendCode")}
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="w-32 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center font-mono text-sm outline-none"
                    placeholder="123456"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy || code.trim().length !== 6}
                    onClick={() => void verifyOtp()}
                    className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {busy ? "…" : t("profile.verify")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
