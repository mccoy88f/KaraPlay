import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/context";
import { getEventSocket } from "../../lib/socket";
import { youtubeVideoId } from "../YoutubeEmbed";

const base = import.meta.env.VITE_API_URL ?? "";
import { ADMIN_EVENT_KEY } from "../../lib/adminEvent";

type AdminEvent = {
  id: string;
  name: string;
  location: string;
  date: string;
  status: string;
  joinCode: string;
  soundfontBankId?: string;
};

type QueueBooking = {
  id: string;
  status: string;
  position: number;
  ytUrl: string | null;
  ytTitle: string | null;
  ytProcessError: string | null;
  user: { nickname: string };
  song: { id: string; title: string; artist: string; source?: string; coverUrl?: string | null; mutedTrack?: number | null; transposeSemitones?: number } | null;
  performance: { id: string; scoreTotal?: number | null } | null;
};

function bookingTitle(b: QueueBooking, fallback: string): string {
  if (b.song) return `${b.song.title} — ${b.song.artist}`;
  return b.ytTitle ?? b.ytUrl ?? fallback;
}

function bookingCoverUrl(b: QueueBooking): string | null {
  if (b.song?.coverUrl) return b.song.coverUrl;
  if (b.ytUrl) {
    const vid = youtubeVideoId(b.ytUrl);
    if (vid) return `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
  }
  return null;
}

function QueueBookingThumb({ b }: { b: QueueBooking }) {
  const url = bookingCoverUrl(b);
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-14 w-24 shrink-0 rounded-lg object-cover"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    );
  }
  return (
    <div
      className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-xl text-amber-200/80"
      aria-hidden
    >
      🎵
    </div>
  );
}

type MidiSongSettings = {
  id: string;
  mutedTrack?: number | null;
  transposeSemitones?: number;
};

type MidiTrackOption = {
  number: number;
  name: string;
  channel: number;
  noteCount: number;
  isDrum: boolean;
  instrumentName: string;
};

function formatMuteChannelNumber(channel: number, t: (key: string, params?: Record<string, string | number>) => string): string {
  return t("admin.live.muteChannel", { n: String(channel).padStart(2, "0") });
}

function formatMuteChannelLabel(
  track: MidiTrackOption,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const ch = formatMuteChannelNumber(track.channel, t);
  const unnamed = t("admin.live.unnamedTrack");
  const name = track.name !== unnamed ? track.name : track.instrumentName;
  return name ? `${ch} - ${name}` : ch;
}

function compareMuteChannels(a: MidiTrackOption, b: MidiTrackOption): number {
  return a.channel - b.channel;
}

function midiControlSelectClass(active: boolean) {
  return active
    ? "rounded-lg border border-amber-500/50 bg-amber-950/40 px-2 py-2 text-xs text-amber-200 outline-none"
    : "rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-xs text-zinc-400 outline-none";
}

function TransposeLiveControl({
  transpose,
  onTranspose,
  title,
  className = "",
}: {
  transpose: number;
  onTranspose: (semitones: number) => void;
  title: string;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <select
      title={title}
      value={transpose}
      onChange={(e) => onTranspose(Number(e.target.value))}
      className={`${midiControlSelectClass(transpose !== 0)} ${className}`.trim()}
    >
      {Array.from({ length: 25 }, (_, i) => i - 12).map((n) => (
        <option key={n} value={n}>
          {n === 0
            ? t("admin.live.transposeOrig")
            : n > 0
              ? t("admin.live.transposePlus", { n })
              : t("admin.live.transposeMinus", { n })}
        </option>
      ))}
    </select>
  );
}

function MidiLiveControls({
  song,
  onMute,
  onTranspose,
  muteTitle,
  transposeTitle,
  authHeader,
  className = "",
}: {
  song: MidiSongSettings;
  onMute: (track: number | null) => void;
  onTranspose: (semitones: number) => void;
  muteTitle: string;
  transposeTitle: string;
  authHeader: () => Record<string, string>;
  className?: string;
}) {
  const { t } = useI18n();
  const [tracks, setTracks] = useState<MidiTrackOption[]>([]);
  const transpose = song.transposeSemitones ?? 0;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${base}/api/admin/songs/${encodeURIComponent(song.id)}/midi-tracks`, {
          headers: authHeader(),
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setTracks(((data as { tracks?: MidiTrackOption[] }).tracks ?? []).filter((t) => !t.isDrum));
        } else if (!cancelled) {
          setTracks([]);
        }
      } catch {
        if (!cancelled) setTracks([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [song.id, authHeader]);

  const muteOptions = useMemo(() => {
    const list =
      tracks.length > 0
        ? tracks
        : Array.from({ length: 15 }, (_, i) => i + 1)
            .filter((ch) => ch !== 10)
            .map((ch) => ({
              number: ch,
              name: "",
              channel: ch,
              noteCount: 0,
              isDrum: false,
              instrumentName: "",
            }));
    return [...list].sort(compareMuteChannels);
  }, [tracks]);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select
        title={muteTitle}
        value={song.mutedTrack ?? ""}
        onChange={(e) => onMute(e.target.value === "" ? null : Number(e.target.value))}
        className={midiControlSelectClass(song.mutedTrack != null)}
      >
        <option value="">{t("admin.live.voiceOn")}</option>
        {muteOptions.map((track) => (
          <option key={track.number} value={track.number}>
            {formatMuteChannelLabel(track, t)}
          </option>
        ))}
      </select>
      <TransposeLiveControl
        transpose={transpose}
        onTranspose={onTranspose}
        title={transposeTitle}
      />
    </div>
  );
}

type Props = {
  authHeader: () => Record<string, string>;
};

export function LiveConsole({ authHeader }: Props) {
  const { t } = useI18n();
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(() => localStorage.getItem(ADMIN_EVENT_KEY));
  const [queue, setQueue] = useState<QueueBooking[]>([]);
  const [voteAvg, setVoteAvg] = useState<number | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // creazione serata
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const event = events.find((e) => e.id === eventId) ?? null;
  const performingRef = useRef<string | null>(null);
  const defaultSongTitle = t("admin.live.defaultSongTitle");

  const statusSteps = useMemo(
    () => [
      { id: "DRAFT", label: t("admin.live.statusDraft"), hint: t("admin.live.statusDraftHint") },
      { id: "OPEN", label: t("admin.live.statusOpen"), hint: t("admin.live.statusOpenHint") },
      { id: "ENDED", label: t("admin.live.statusEnded"), hint: t("admin.live.statusEndedHint") },
    ],
    [t]
  );

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/events`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEvents(((data as { events: AdminEvent[] }).events ?? []));
    } catch {
      setErr(t("admin.live.eventsUnavailable"));
    }
  }, [authHeader, t]);

  const loadQueue = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${base}/api/events/${encodeURIComponent(id)}/queue`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setQueue(((data as { queue: QueueBooking[] }).queue ?? []));
    } catch {
      /* il socket riallinea al prossimo evento */
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  // serata selezionata: coda automatica + aggiornamenti live via socket
  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem(ADMIN_EVENT_KEY, eventId);
    void loadQueue(eventId);
    setVoteAvg(null);
    setVoteCount(0);
    setLastScore(null);

    const socket = getEventSocket(eventId);
    const onQueue = (p: { queue: QueueBooking[] }) => setQueue(p.queue ?? []);
    const onVote = (p: { performanceId: string; avg: number; count: number }) => {
      if (performingRef.current && p.performanceId !== performingRef.current) return;
      setVoteAvg(p.count > 0 ? p.avg : null);
      setVoteCount(p.count);
    };
    const onStart = () => {
      setVoteAvg(null);
      setVoteCount(0);
      setLastScore(null);
    };
    const onEnd = (p: { score?: number }) => {
      setVoteAvg(null);
      setVoteCount(0);
      if (typeof p?.score === "number") setLastScore(p.score);
    };
    socket.on("queue:update", onQueue);
    socket.on("vote:update", onVote);
    socket.on("performance:start", onStart);
    socket.on("performance:end", onEnd);
    return () => {
      socket.off("queue:update", onQueue);
      socket.off("vote:update", onVote);
      socket.off("performance:start", onStart);
      socket.off("performance:end", onEnd);
    };
  }, [eventId, loadQueue]);

  const performing = queue.find((b) => b.status === "PERFORMING") ?? null;
  performingRef.current = performing?.performance?.id ?? null;
  const pending = queue.filter((b) => b.status === "PENDING");
  const upcoming = queue.filter((b) => ["APPROVED", "READY", "PROCESSING"].includes(b.status));
  const done = queue.filter((b) => b.status === "DONE").slice(-6).reverse();

  async function adminFetch(path: string, init?: RequestInit): Promise<boolean> {
    setErr(null);
    const res = await fetch(`${base}/api${path}`, {
      ...init,
      headers: {
        // Content-Type JSON solo se c'è un body: Fastify risponde 400 a JSON con body vuoto.
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

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setCreating(true);
    try {
      const res = await fetch(`${base}/api/admin/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          name: newName.trim(),
          location: newLocation.trim() || "—",
          date: new Date().toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? t("admin.createFailed"));
        return;
      }
      const created = data as AdminEvent;
      await loadEvents();
      setEventId(created.id);
      setShowCreate(false);
      setNewName("");
      setNewLocation("");
      setMsg(t("admin.live.eventCreated", { pin: created.joinCode }));
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(status: string) {
    if (!event) return;
    setMsg(null);
    if (status === "ENDED" && !window.confirm(t("admin.live.closeEventConfirm"))) return;
    const ok = await adminFetch(`/admin/events/${event.id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    if (ok) await loadEvents();
  }

  async function approve(b: QueueBooking, yes: boolean) {
    setMsg(null);
    setBusy(b.id);
    try {
      await adminFetch(`/admin/bookings/${b.id}/${yes ? "approve" : "reject"}`, { method: "PUT" });
    } finally {
      setBusy(null);
    }
  }

  async function start(b: QueueBooking) {
    setMsg(null);
    setBusy(b.id);
    try {
      const ok = await adminFetch(`/admin/performances/start/${b.id}`, { method: "POST" });
      if (ok) setMsg(t("admin.live.performerOnStage", { name: b.user.nickname }));
    } finally {
      setBusy(null);
    }
  }

  async function end() {
    if (!performing?.performance) return;
    setMsg(null);
    const ok = await adminFetch(`/admin/performances/${performing.performance.id}/end`, { method: "POST" });
    if (ok) setMsg(t("admin.live.performanceEnded"));
  }

  async function reorderQueue(bookingIds: string[]) {
    if (!eventId) return;
    await adminFetch(`/admin/events/${eventId}/queue/reorder`, {
      method: "PUT",
      body: JSON.stringify({ bookingIds }),
    });
  }

  function handleQueueDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function handleQueueDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragId && dragId !== id) setDragOverId(id);
  }

  function handleQueueDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const fromId = dragId ?? e.dataTransfer.getData("text/plain");
    setDragId(null);
    setDragOverId(null);
    if (!fromId || fromId === targetId) return;

    const fromIdx = upcoming.findIndex((b) => b.id === fromId);
    const toIdx = upcoming.findIndex((b) => b.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = [...upcoming];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    void reorderQueue(next.map((b) => b.id));
  }

  function handleQueueDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  async function remove(b: QueueBooking) {
    if (!window.confirm(t("admin.live.removeFromQueueConfirm", { title: bookingTitle(b, defaultSongTitle) }))) return;
    await adminFetch(`/admin/bookings/${b.id}`, { method: "DELETE" });
  }

  /** Voce guida del MIDI (ghost track, di solito la traccia 4): on/off per tutte le esecuzioni. */
  async function setMutedTrack(songId: string, track: number | null) {
    setMsg(null);
    const ok = await adminFetch(`/admin/songs/${songId}/muted-track`, {
      method: "PUT",
      body: JSON.stringify({ track }),
    });
    if (ok) {
      setMsg(track == null ? t("admin.live.guideVoiceRestored") : t("admin.live.trackMuted", { n: track }));
      if (eventId) await loadQueue(eventId);
    }
  }

  /** Tonalità in semitoni: vale per tutte le esecuzioni MIDI e si applica live sul display. */
  async function setTransposeSemitones(songId: string, semitones: number) {
    setMsg(null);
    const ok = await adminFetch(`/admin/songs/${songId}/transpose-semitones`, {
      method: "PUT",
      body: JSON.stringify({ semitones }),
    });
    if (ok) {
      setMsg(
        semitones === 0
          ? t("admin.live.transposeOriginal")
          : t("admin.live.transposeSet", { n: semitones > 0 ? `+${semitones}` : String(semitones) })
      );
      if (eventId) await loadQueue(eventId);
    }
  }

  /** Rinomina il titolo mostrato per una prenotazione video. */
  async function renameVideo(b: QueueBooking) {
    const newTitle = window.prompt(t("admin.live.renameVideoPrompt"), b.ytTitle ?? "");
    if (newTitle == null || !newTitle.trim()) return;
    setMsg(null);
    const ok = await adminFetch(`/admin/bookings/${b.id}/title`, {
      method: "PUT",
      body: JSON.stringify({ ytTitle: newTitle.trim() }),
    });
    if (ok) setMsg(t("admin.live.titleUpdated"));
  }

  /** Bis: rimette il brano in fondo alla scaletta. */
  async function replay(b: QueueBooking) {
    setMsg(null);
    setBusy(b.id);
    try {
      const ok = await adminFetch(`/admin/bookings/${b.id}/replay`, { method: "POST" });
      if (ok) setMsg(t("admin.live.replayQueued", { title: bookingTitle(b, defaultSongTitle) }));
    } finally {
      setBusy(null);
    }
  }

  async function downloadVideo(b: QueueBooking) {
    setMsg(null);
    setBusy(b.id);
    try {
      const ok = await adminFetch(`/admin/youtube/process/${b.id}`, { method: "POST" });
      if (ok) setMsg(t("admin.live.downloadStarted"));
    } finally {
      setBusy(null);
    }
  }

  // ---------- render ----------

  return (
    <div className="space-y-6">
      {/* scelta serata */}
      <section className="kg-card p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
            <span className="text-zinc-400">{t("admin.yourEvent")}</span>
            <select
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-zinc-100 outline-none ring-fuchsia-500/30 focus:ring-2"
              value={eventId ?? ""}
              onChange={(e) => setEventId(e.target.value || null)}
            >
              <option value="">{t("admin.live.chooseEvent")}</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} · {t("admin.live.pin")} {ev.joinCode}
                  {ev.status === "ENDED" ? t("admin.live.eventEndedSuffix") : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/15 px-5 py-3 text-sm font-medium text-fuchsia-100 hover:bg-fuchsia-500/25"
          >
            {t("admin.live.newEvent")}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createEvent} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
              <span className="text-zinc-400">{t("admin.live.eventName")}</span>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("admin.live.eventNamePlaceholder")}
                required
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
              <span className="text-zinc-400">{t("admin.live.locationOptional")}</span>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder={t("admin.live.locationPlaceholder")}
              />
            </label>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40"
            >
              {creating ? t("admin.live.creating") : t("admin.live.createEvent")}
            </button>
          </form>
        )}

        {event && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div>
              <p className="font-display text-lg font-semibold text-white">{event.name}</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                {t("admin.live.pin")} <span className="font-mono text-xl tracking-[0.2em] text-fuchsia-300">{event.joinCode}</span>
                <span className="mx-2 text-zinc-700">·</span>
                <a
                  href={`/display?eventId=${event.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-300 underline-offset-2 hover:underline"
                >
                  {t("admin.live.openDisplay")}
                </a>
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("admin.live.statusGroupAria")}>
              {statusSteps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.hint}
                  onClick={() => void setStatus(s.id)}
                  className={
                    event.status === s.id
                      ? "rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                  }
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {msg && <p className="text-sm text-emerald-400">{msg}</p>}
      {err && <p className="text-sm text-red-400">{err}</p>}

      {event && (
        <>
          {/* ora sul palco */}
          {performing ? (
            <section className="kg-card border-fuchsia-500/30 p-5 md:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-fuchsia-400/90">{t("admin.live.nowOnStage")}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-display text-2xl font-semibold text-white">{performing.user.nickname}</p>
                  <p className="mt-1 text-zinc-300">{bookingTitle(performing, defaultSongTitle)}</p>
                </div>
                <div className="flex items-center gap-4">
                  {performing.song?.source === "MIDI" && (
                    <MidiLiveControls
                      song={performing.song}
                      authHeader={authHeader}
                      muteTitle={t("admin.live.muteTitleLive")}
                      transposeTitle={t("admin.live.transposeTitleLive")}
                      onMute={(track) => void setMutedTrack(performing.song!.id, track)}
                      onTranspose={(semitones) => void setTransposeSemitones(performing.song!.id, semitones)}
                    />
                  )}
                  {performing.song?.source === "YOUTUBE" && (
                    <TransposeLiveControl
                      transpose={performing.song.transposeSemitones ?? 0}
                      title={t("admin.live.transposeTitleYoutubeLive")}
                      onTranspose={(semitones) => void setTransposeSemitones(performing.song!.id, semitones)}
                    />
                  )}
                  <p className="rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-200">
                    ★ <span className="font-display text-xl font-semibold">{voteAvg != null ? voteAvg.toFixed(1) : "—"}</span>
                    <span className="ml-2 text-xs text-amber-200/70">
                      {voteCount} {voteCount === 1 ? t("common.vote") : t("common.votes")}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void end()}
                    className="rounded-xl bg-zinc-100 px-6 py-3 font-semibold text-zinc-900 hover:bg-white"
                  >
                    {t("admin.live.endPerformance")}
                  </button>
                </div>
              </div>
            </section>
          ) : (
            lastScore !== null && (
              <p className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-3 text-fuchsia-100">
                {t("admin.live.lastPerformance", { score: lastScore.toFixed(1) })}
              </p>
            )
          )}

          {/* richieste da approvare */}
          {pending.length > 0 && (
            <section className="kg-card border-amber-500/30 p-5 md:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-amber-300/90">
                {t("admin.live.pendingRequests", { n: pending.length })}
              </p>
              <ul className="mt-4 space-y-3">
                {pending.map((b) => {
                  const vid = b.ytUrl ? youtubeVideoId(b.ytUrl) : null;
                  return (
                    <li key={b.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                      {vid && (
                        <img
                          src={`https://i.ytimg.com/vi/${vid}/mqdefault.jpg`}
                          alt=""
                          className="h-14 w-24 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white">{b.user.nickname}</p>
                        <p className="truncate text-sm text-zinc-400" title={bookingTitle(b, defaultSongTitle)}>
                          {bookingTitle(b, defaultSongTitle)}
                        </p>
                        {b.ytUrl && (
                          <a
                            href={b.ytUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-red-300/80 underline-offset-2 hover:underline"
                          >
                            {t("admin.live.watchOnYoutube")}
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={busy === b.id}
                        onClick={() => void approve(b, true)}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                      >
                        {t("admin.live.addToQueue")}
                      </button>
                      <button
                        type="button"
                        disabled={busy === b.id}
                        onClick={() => void approve(b, false)}
                        className="rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* scaletta */}
          <section className="kg-card p-5 md:p-6">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-cyan-400/90">
                {t("admin.live.schedule", { n: upcoming.length })}
              </p>
              <p className="text-xs text-zinc-600">{t("admin.live.dragHint")}</p>
            </div>

            {upcoming.length === 0 ? (
              <p className="mt-6 text-center text-sm text-zinc-500">
                {t("admin.live.emptyQueue", { pin: event.joinCode })}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {upcoming.map((b, i) => (
                  <li
                    key={b.id}
                    onDragOver={(e) => handleQueueDragOver(e, b.id)}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(e) => handleQueueDrop(e, b.id)}
                    className={`rounded-xl border p-4 transition-colors ${
                      dragOverId === b.id
                        ? "border-cyan-400/60 bg-cyan-500/10"
                        : i === 0 && !performing
                          ? "border-fuchsia-500/40 bg-fuchsia-500/5"
                          : "border-zinc-800 bg-zinc-950/60"
                    } ${dragId === b.id ? "opacity-60" : ""}`}
                  >
                    <div className="flex gap-3">
                      <div className="flex shrink-0 flex-col items-center gap-1">
                        <button
                          type="button"
                          draggable
                          onDragStart={(e) => handleQueueDragStart(e, b.id)}
                          onDragEnd={handleQueueDragEnd}
                          className="cursor-grab touch-none rounded px-1 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 active:cursor-grabbing"
                          title={t("admin.live.dragToReorder")}
                          aria-label={t("admin.live.dragToReorder")}
                        >
                          ⠿
                        </button>
                        <span className="font-mono text-sm text-zinc-600">{i + 1}</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <QueueBookingThumb b={b} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-snug text-white">
                              {b.user.nickname}
                              {b.ytUrl && (
                                <span className="ml-2 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase text-red-200/90">
                                  {t("admin.live.badgeVideo")}
                                </span>
                              )}
                              {b.status === "READY" && (
                                <span className="ml-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase text-emerald-200/90">
                                  {t("admin.live.badgeNoAds")}
                                </span>
                              )}
                              {b.status === "PROCESSING" && (
                                <span className="ml-2 text-xs text-amber-300/90">{t("admin.live.downloading")}</span>
                              )}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{bookingTitle(b, defaultSongTitle)}</p>
                            {b.ytProcessError && (
                              <p className="mt-1 text-xs leading-relaxed text-red-400" title={b.ytProcessError}>
                                {t("admin.live.downloadFailed", { error: b.ytProcessError.slice(0, 120) })}
                                <span className="text-zinc-500"> {t("admin.live.downloadFailedHint")}</span>
                              </p>
                            )}
                          </div>
                          {b.status !== "PROCESSING" && (
                            <button
                              type="button"
                              disabled={busy === b.id || Boolean(performing)}
                              title={performing ? t("admin.live.stageOccupied") : t("admin.live.sendToStage")}
                              onClick={() => void start(b)}
                              className={`shrink-0 ${
                                i === 0
                                  ? "rounded-xl bg-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40"
                                  : "rounded-xl border border-fuchsia-500/40 px-4 py-2 text-sm text-fuchsia-200 hover:bg-fuchsia-500/15 disabled:opacity-40"
                              }`}
                            >
                              {t("admin.live.onStage")}
                            </button>
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                      {b.song?.source === "MIDI" && (
                        <MidiLiveControls
                          song={b.song}
                          authHeader={authHeader}
                          muteTitle={t("admin.live.muteTitleQueue")}
                          transposeTitle={t("admin.live.transposeTitleQueue")}
                          onMute={(track) => void setMutedTrack(b.song!.id, track)}
                          onTranspose={(semitones) => void setTransposeSemitones(b.song!.id, semitones)}
                        />
                      )}
                      {b.song?.source === "YOUTUBE" && (
                        <TransposeLiveControl
                          transpose={b.song.transposeSemitones ?? 0}
                          title={t("admin.live.transposeTitleYoutubeQueue")}
                          onTranspose={(semitones) => void setTransposeSemitones(b.song!.id, semitones)}
                        />
                      )}
                      {b.ytUrl && (
                        <button
                          type="button"
                          title={t("admin.live.renameVideoTitle")}
                          onClick={() => void renameVideo(b)}
                          className="rounded border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                        >
                          ✏️
                        </button>
                      )}
                      {b.ytUrl && b.status === "APPROVED" && !b.song && (
                        <button
                          type="button"
                          disabled={busy === b.id}
                          title={t("admin.live.downloadVideoTitle")}
                          onClick={() => void downloadVideo(b)}
                          className="rounded-lg border border-emerald-500/50 px-2.5 py-2 text-xs text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-40"
                        >
                          {t("admin.live.noAdsDownload")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void remove(b)}
                        className="rounded-lg border border-red-500/40 px-2 py-2 text-xs text-red-300 hover:bg-red-950/40"
                        title={t("admin.live.removeFromQueueTitle")}
                      >
                        🗑
                      </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* già cantate: bis con un tap */}
          {done.length > 0 && (
            <section className="kg-card p-5 md:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
                {t("admin.live.alreadySung", { n: done.length })}
              </p>
              <ul className="mt-3 space-y-2">
                {done.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-300">
                        <span className="font-medium text-white">{b.user.nickname}</span>
                        <span className="text-zinc-600"> · </span>
                        {bookingTitle(b, defaultSongTitle)}
                      </p>
                    </div>
                    {b.performance?.scoreTotal != null && (
                      <span className="font-display shrink-0 text-amber-300">
                        ★ {b.performance.scoreTotal.toFixed(1)}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busy === b.id}
                      title={t("admin.live.replayTitle")}
                      onClick={() => void replay(b)}
                      className="shrink-0 rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-40"
                    >
                      {t("admin.live.replay")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
