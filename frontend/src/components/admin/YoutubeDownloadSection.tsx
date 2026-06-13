import { useCallback, useEffect, useState } from "react";
import { ADMIN_EVENT_KEY } from "../../lib/adminEvent";
import { useI18n } from "../../i18n/context";

const base = import.meta.env.VITE_API_URL ?? "";

type AdminEvent = {
  id: string;
  name: string;
  joinCode: string;
  status: string;
  youtubeAutoDownload?: boolean;
};

type Props = {
  authHeader: () => Record<string, string>;
};

/** Impostazioni download video YouTube per la serata selezionata. */
export function YoutubeDownloadSection({ authHeader }: Props) {
  const { t } = useI18n();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(() => localStorage.getItem(ADMIN_EVENT_KEY));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const event = events.find((e) => e.id === eventId) ?? null;

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/events`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEvents(((data as { events: AdminEvent[] }).events ?? []));
    } catch {
      setErr(t("admin.live.eventsUnavailable"));
    }
  }, [authHeader, t]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem(ADMIN_EVENT_KEY, eventId);
  }, [eventId]);

  async function persistAutoDownload(enabled: boolean) {
    if (!event) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`${base}/api/admin/events/${encodeURIComponent(event.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ youtubeAutoDownload: enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? t("admin.live.operationFailed"));
        return;
      }
      setMsg(enabled ? t("admin.youtubeDownload.enabledOk") : t("admin.youtubeDownload.disabledOk"));
      await loadEvents();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="kg-card p-5 md:p-6">
      <h2 className="font-display text-lg font-semibold text-white">{t("admin.youtubeDownload.title")}</h2>
      <p className="mt-2 text-sm text-zinc-400">{t("admin.youtubeDownload.intro")}</p>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}

      <label className="mt-4 flex max-w-md flex-col gap-1 text-sm">
        <span className="text-zinc-400">{t("admin.youtubeDownload.eventLabel")}</span>
        <select
          className="kg-input"
          value={eventId ?? ""}
          onChange={(e) => setEventId(e.target.value || null)}
        >
          <option value="">{t("admin.youtubeDownload.chooseEvent")}</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} · PIN {ev.joinCode}
            </option>
          ))}
        </select>
      </label>

      {event && (
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <input
            type="checkbox"
            className="mt-1 accent-cyan-500"
            checked={Boolean(event.youtubeAutoDownload)}
            disabled={saving}
            onChange={(e) => void persistAutoDownload(e.target.checked)}
          />
          <span className="text-sm text-zinc-300">
            <span className="font-medium text-white">{t("admin.youtubeDownload.autoLabel")}</span>
            <span className="mt-1 block text-zinc-500">{t("admin.youtubeDownload.autoHint")}</span>
          </span>
        </label>
      )}

      {!event && events.length > 0 && (
        <p className="mt-4 text-sm text-zinc-500">{t("admin.youtubeDownload.selectEventHint")}</p>
      )}
    </section>
  );
}
