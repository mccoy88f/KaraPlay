import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/context";
import { SoundfontSelect } from "../SoundfontSelect";
import { ADMIN_EVENT_KEY } from "../../lib/adminEvent";
import type { SoundfontBankId } from "../../lib/soundfontBanks";
import {
  getSoundfontBank,
  isSf2BankId,
  SF2_MAX_UPLOAD_BYTES,
  SF2_MAX_UPLOAD_LABEL,
} from "../../lib/soundfontBanks";
import { uploadFormWithProgress } from "../../lib/uploadWithProgress";

const base = import.meta.env.VITE_API_URL ?? "";

type AdminEvent = {
  id: string;
  name: string;
  joinCode: string;
  status: string;
  soundfontBankId?: string;
};

type Sf2File = { file: string; size: number };

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  authHeader: () => Record<string, string>;
  isSuper: boolean;
};

export function SoundfontAdminSection({ authHeader, isSuper }: Props) {
  const { t } = useI18n();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(() => localStorage.getItem(ADMIN_EVENT_KEY));
  const [sf2Files, setSf2Files] = useState<Sf2File[]>([]);
  const [sfStatus, setSfStatus] = useState<{ present: number; total: number; ready: boolean } | null>(null);
  const [sfSyncing, setSfSyncing] = useState(false);
  const [sf2Uploading, setSf2Uploading] = useState(false);
  const [sf2UploadPct, setSf2UploadPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sf2InputRef = useRef<HTMLInputElement | null>(null);

  const event = events.find((e) => e.id === eventId) ?? null;
  const soundfontBankId: SoundfontBankId = getSoundfontBank(event?.soundfontBankId).id;

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/events`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEvents(((data as { events: AdminEvent[] }).events ?? []));
    } catch {
      setErr(t("admin.soundfont.eventsUnavailable"));
    }
  }, [authHeader, t]);

  const loadSf2Files = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/soundfonts/sf2`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSf2Files(((data as { files?: Sf2File[] }).files ?? []));
    } catch {
      /* select mostra solo i banchi base */
    }
  }, [authHeader]);

  const fetchSfStatus = useCallback(async () => {
    if (!event || isSf2BankId(soundfontBankId)) {
      setSfStatus(null);
      return;
    }
    try {
      const res = await fetch(`${base}/api/admin/soundfonts/${encodeURIComponent(soundfontBankId)}/status`, {
        headers: { ...authHeader() },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof (data as { present?: number }).present === "number") {
        const d = data as { present: number; total: number; ready: boolean };
        setSfStatus({ present: d.present, total: d.total, ready: d.ready });
      }
    } catch {
      setSfStatus(null);
    }
  }, [event, soundfontBankId, authHeader]);

  useEffect(() => {
    void loadEvents();
    void loadSf2Files();
  }, [loadEvents, loadSf2Files]);

  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem(ADMIN_EVENT_KEY, eventId);
  }, [eventId]);

  useEffect(() => {
    void fetchSfStatus();
  }, [fetchSfStatus]);

  async function adminFetch(path: string, init?: RequestInit): Promise<boolean> {
    setErr(null);
    const res = await fetch(`${base}/api${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...authHeader(),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr((data as { error?: string }).error ?? t("admin.live.operationFailed"));
      return false;
    }
    return true;
  }

  async function persistSoundfont(id: SoundfontBankId) {
    if (!event) return;
    const ok = await adminFetch(`/admin/events/${event.id}`, {
      method: "PUT",
      body: JSON.stringify({ soundfontBankId: id }),
    });
    if (ok) {
      setMsg(t("admin.soundfont.updated"));
      await loadEvents();
    }
  }

  async function syncSoundfont() {
    setSfSyncing(true);
    setErr(null);
    try {
      const res = await fetch(`${base}/api/admin/soundfonts/${encodeURIComponent(soundfontBankId)}/sync`, {
        method: "POST",
        headers: { ...authHeader() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? t("admin.soundfont.syncFailed"));
        return;
      }
      const d = data as { status?: { present: number; total: number; ready: boolean } };
      if (d.status) setSfStatus(d.status);
      setMsg(t("admin.soundfont.syncOk"));
    } finally {
      setSfSyncing(false);
    }
  }

  async function uploadSf2(file: File) {
    setErr(null);
    setMsg(null);
    if (file.size > SF2_MAX_UPLOAD_BYTES) {
      setErr(t("admin.soundfont.fileTooLarge", { size: formatMB(file.size), max: SF2_MAX_UPLOAD_LABEL }));
      if (sf2InputRef.current) sf2InputRef.current.value = "";
      return;
    }
    setSf2Uploading(true);
    setSf2UploadPct(0);
    try {
      const form = new FormData();
      form.append("file", file);
      const { status, data } = await uploadFormWithProgress(
        `${base}/api/admin/soundfonts/sf2/upload`,
        form,
        authHeader(),
        setSf2UploadPct
      );
      if (status === 413) {
        setErr(t("admin.soundfont.fileTooLarge413", { max: SF2_MAX_UPLOAD_LABEL }));
        return;
      }
      if (!status || status >= 400) {
        setErr(typeof data.error === "string" ? data.error : t("admin.soundfont.uploadFailed"));
        return;
      }
      setMsg(t("admin.soundfont.uploaded", { name: file.name, size: formatMB(file.size) }));
      await loadSf2Files();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("admin.soundfont.uploadFailed"));
    } finally {
      setSf2Uploading(false);
      setSf2UploadPct(null);
      if (sf2InputRef.current) sf2InputRef.current.value = "";
    }
  }

  async function deleteSf2(file: string) {
    if (!window.confirm(t("admin.soundfont.deleteConfirm", { file }))) return;
    setErr(null);
    const ok = await adminFetch(`/admin/soundfonts/sf2/${encodeURIComponent(file)}`, { method: "DELETE" });
    if (ok) {
      setMsg(t("admin.soundfont.deleted", { file }));
      await loadSf2Files();
    }
  }

  return (
    <section className="kg-card p-5 md:p-6">
      <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">{t("admin.soundfont.title")}</h2>
      <p className="mt-2 text-sm text-zinc-400">{t("admin.soundfont.intro")}</p>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}

      <label className="mt-4 flex max-w-md flex-col gap-1 text-sm">
        <span className="text-zinc-400">{t("admin.soundfont.eventLabel")}</span>
        <select
          className="kg-input"
          value={eventId ?? ""}
          onChange={(e) => setEventId(e.target.value || null)}
        >
          <option value="">{t("admin.soundfont.chooseEvent")}</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} · PIN {ev.joinCode}
            </option>
          ))}
        </select>
      </label>

      {event && (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <SoundfontSelect
              value={soundfontBankId}
              onChange={(id) => void persistSoundfont(id)}
              sf2Files={sf2Files.map((f) => f.file)}
              id="tech-soundfont"
              label={t("admin.soundfont.bankLabel")}
            />
            {!isSf2BankId(soundfontBankId) && sfStatus && (
              <p className="mt-2 text-xs text-zinc-400">
                {t("admin.soundfont.serverSounds")}{" "}
                <span className="font-mono text-zinc-200">
                  {sfStatus.present}/{sfStatus.total}
                </span>
                {sfStatus.ready ? (
                  <span className="ml-2 text-emerald-400/90">{t("admin.soundfont.ready")}</span>
                ) : (
                  <span className="ml-2 text-amber-400/90">{t("admin.soundfont.downloadHint")}</span>
                )}
              </p>
            )}
            {!isSf2BankId(soundfontBankId) &&
              (isSuper ? (
                <button
                  type="button"
                  disabled={sfSyncing}
                  onClick={() => void syncSoundfont()}
                  className="mt-3 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40"
                >
                  {sfSyncing ? t("admin.soundfont.syncing") : t("admin.soundfont.syncBtn")}
                </button>
              ) : (
                sfStatus &&
                !sfStatus.ready && (
                  <p className="mt-3 text-xs text-amber-300/90">{t("admin.soundfont.askSuperAdmin")}</p>
                )
              ))}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{t("admin.soundfont.customTitle")}</p>
            <ul className="mt-2 space-y-1">
              {sf2Files.map((f) => (
                <li key={f.file} className="flex items-center justify-between gap-2 text-sm text-zinc-300">
                  <span className="truncate font-mono text-xs" title={f.file}>
                    {f.file} <span className="text-zinc-600">({formatMB(f.size)})</span>
                  </span>
                  {isSuper && (
                    <button
                      type="button"
                      onClick={() => void deleteSf2(f.file)}
                      className="rounded border border-red-500/50 px-2 py-0.5 text-xs text-red-200 hover:bg-red-900/50"
                    >
                      {t("admin.soundfont.delete")}
                    </button>
                  )}
                </li>
              ))}
              {sf2Files.length === 0 && <li className="text-xs text-zinc-600">{t("admin.soundfont.noFiles")}</li>}
            </ul>

            {isSuper ? (
              <div className="mt-3 space-y-2">
                <label className="inline-block">
                  <span
                    className={`cursor-pointer rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-2 text-sm text-fuchsia-100 hover:bg-fuchsia-500/25 ${sf2Uploading ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {sf2Uploading ? t("admin.soundfont.uploading") : t("admin.soundfont.uploadBtn")}
                  </span>
                  <input
                    ref={sf2InputRef}
                    type="file"
                    accept=".sf2,.sf3"
                    disabled={sf2Uploading}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadSf2(f);
                    }}
                  />
                </label>
                <p className="text-xs text-zinc-600">{t("admin.soundfont.maxPerFile", { max: SF2_MAX_UPLOAD_LABEL })}</p>
                {sf2Uploading && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                      <span>{t("admin.soundfont.uploadProgress")}</span>
                      <span className="font-mono tabular-nums text-fuchsia-300">{sf2UploadPct ?? 0}%</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-fuchsia-500 transition-[width] duration-150"
                        style={{ width: `${sf2UploadPct ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-zinc-600">{t("admin.soundfont.superAdminOnly")}</p>
            )}
          </div>
        </div>
      )}

      {!event && events.length > 0 && (
        <p className="mt-4 text-sm text-zinc-500">{t("admin.soundfont.selectEventHint")}</p>
      )}
    </section>
  );
}
