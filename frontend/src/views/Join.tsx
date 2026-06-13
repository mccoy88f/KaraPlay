import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiGetEvent, apiJoin, setStoredEvent, setStoredNickname, setStoredToken } from "../api/client";
import { isJoinContactValid, joinContactInputMode } from "../lib/joinContact";
import { useI18n } from "../i18n/context";

export function Join() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [nickname, setNickname] = useState("");
  const [contact, setContact] = useState("");
  const [pin, setPin] = useState(() => searchParams.get("pin") ?? "");
  const [preview, setPreview] = useState<{ name: string; location: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePreviewPin() {
    if (pin.trim().length < 6) return;
    setError(null);
    setLoading(true);
    try {
      const ev = (await apiGetEvent(pin.trim())) as { name: string; location: string };
      setPreview({ name: ev.name, location: ev.location });
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  function applyJoinSuccess(res: Awaited<ReturnType<typeof apiJoin>>) {
    if (!res.token || !res.user || !res.event) {
      setError(t("common.error"));
      return;
    }
    setStoredToken(res.token);
    setStoredEvent(res.event);
    setStoredNickname(res.user.nickname);
    navigate("/join", { replace: true, state: { joined: true } });
  }

  async function submitJoin(confirmNicknameChange?: boolean, nicknameOverride?: string) {
    const res = await apiJoin({
      nickname: (nicknameOverride ?? nickname).trim(),
      contact: contact.trim(),
      eventJoinCode: pin.trim(),
      confirmNicknameChange,
    });

    if (res.needsNicknameConfirm && res.storedNickname && res.requestedNickname) {
      const change = window.confirm(
        t("join.enter.nicknameConfirm", {
          stored: res.storedNickname,
          requested: res.requestedNickname,
        })
      );
      if (change) {
        await submitJoin(true);
      } else {
        setNickname(res.storedNickname);
        await submitJoin(undefined, res.storedNickname);
      }
      return;
    }

    applyJoinSuccess(res);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await submitJoin();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }

  const contactMode = joinContactInputMode(contact);
  const canSubmit =
    nickname.trim().length > 0 && isJoinContactValid(contact) && pin.trim().length >= 4;

  return (
    <div className="kg-page-bg flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <header className="mb-8 text-center">
          <Link to="/join" className="text-xs uppercase tracking-[0.25em] text-zinc-500 hover:text-zinc-300">
            {t("common.back")}
          </Link>
          <p className="font-display mt-6 text-xs uppercase tracking-[0.35em] text-fuchsia-400/90">
            {t("join.enter.access")}
          </p>
          <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-white">{t("join.enter.title")}</h1>
          <p className="mt-3 text-sm text-zinc-400">{t("join.enter.subtitle")}</p>
        </header>

        <form onSubmit={(e) => void handleJoin(e)} className="kg-card flex flex-col gap-5 p-6 shadow-2xl shadow-black/50 md:p-8">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-400">{t("join.enter.pin")}</span>
            <input
              className="kg-input font-mono text-lg tracking-[0.2em]"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onBlur={() => void handlePreviewPin()}
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
            <span className="text-zinc-400">{t("join.enter.contact")}</span>
            <input
              type="text"
              className="kg-input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={t("join.enter.contactPlaceholder")}
              inputMode={contactMode}
              autoComplete={contactMode === "email" ? "email" : contactMode === "numeric" ? "tel" : "username"}
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-zinc-400">{t("join.enter.nickname")}</span>
            <input
              className="kg-input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t("join.enter.nicknamePlaceholder")}
              maxLength={40}
              required
            />
          </label>

          <p className="text-xs text-zinc-500">{t("join.enter.contactHint")}</p>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="font-display mt-2 rounded-2xl bg-gradient-to-r from-fuchsia-600 to-fuchsia-500 px-4 py-4 font-semibold text-white transition hover:from-fuchsia-500 hover:to-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? t("join.enter.connecting") : t("join.enter.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
