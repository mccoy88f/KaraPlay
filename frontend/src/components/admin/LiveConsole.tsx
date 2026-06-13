import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SoundfontSelect } from "../SoundfontSelect";
import { getEventSocket } from "../../lib/socket";
import type { SoundfontBankId } from "../../lib/soundfontBanks";
import { getSoundfontBank, isSf2BankId } from "../../lib/soundfontBanks";
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
  song: { id: string; title: string; artist: string; source?: string; mutedTrack?: number | null; transposeSemitones?: number } | null;
  performance: { id: string; scoreTotal?: number | null } | null;
};

type Sf2File = { file: string; size: number };

const STATUS_STEPS: { id: string; label: string; hint: string }[] = [
  { id: "DRAFT", label: "In preparazione", hint: "Il pubblico non può ancora entrare" },
  { id: "OPEN", label: "Prenotazioni aperte", hint: "Il pubblico entra e prenota" },
  { id: "LIVE", label: "Serata live", hint: "Si canta! Prenotazioni ancora aperte" },
  { id: "ENDED", label: "Conclusa", hint: "Serata chiusa" },
];

function bookingTitle(b: QueueBooking): string {
  if (b.song) return `${b.song.title} — ${b.song.artist}`;
  return b.ytTitle ?? b.ytUrl ?? "Brano";
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

function formatMuteChannelNumber(channel: number): string {
  return `Ch.${String(channel).padStart(2, "0")}`;
}

function formatMuteChannelLabel(t: MidiTrackOption): string {
  const ch = formatMuteChannelNumber(t.channel);
  const name = t.name !== "(senza nome)" ? t.name : t.instrumentName;
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
  return (
    <select
      title={title}
      value={transpose}
      onChange={(e) => onTranspose(Number(e.target.value))}
      className={`${midiControlSelectClass(transpose !== 0)} ${className}`.trim()}
    >
      {Array.from({ length: 25 }, (_, i) => i - 12).map((n) => (
        <option key={n} value={n}>
          {n === 0 ? "🎵 tono orig." : n > 0 ? `🎵 +${n} st` : `🎵 ${n} st`}
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
        <option value="">🎤 voce on</option>
        {muteOptions.map((t) => (
          <option key={t.number} value={t.number}>
            {formatMuteChannelLabel(t)}
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

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type Props = {
  authHeader: () => Record<string, string>;
  /** Solo il super admin può modificare i file del server (sync banchi, upload/delete sf2). */
  isSuper: boolean;
};

export function LiveConsole({ authHeader, isSuper }: Props) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(() => localStorage.getItem(ADMIN_EVENT_KEY));
  const [queue, setQueue] = useState<QueueBooking[]>([]);
  const [voteAvg, setVoteAvg] = useState<number | null>(null);
  const [voteCount, setVoteCount] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // creazione serata
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);

  // impostazioni audio (sezione richiudibile)
  const [showAudio, setShowAudio] = useState(false);
  const [sf2Files, setSf2Files] = useState<Sf2File[]>([]);
  const [sfStatus, setSfStatus] = useState<{ present: number; total: number; ready: boolean } | null>(null);
  const [sfSyncing, setSfSyncing] = useState(false);
  const [sf2Uploading, setSf2Uploading] = useState(false);
  const sf2InputRef = useRef<HTMLInputElement | null>(null);

  const event = events.find((e) => e.id === eventId) ?? null;
  const performingRef = useRef<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/events`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEvents(((data as { events: AdminEvent[] }).events ?? []));
    } catch {
      setErr("Serate non disponibili: backend raggiungibile?");
    }
  }, [authHeader]);

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
      setErr((data as { error?: string }).error ?? "Operazione non riuscita");
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
        setErr((data as { error?: string }).error ?? "Creazione fallita");
        return;
      }
      const created = data as AdminEvent;
      // la serata nasce già pronta ad accogliere il pubblico
      await adminFetch(`/admin/events/${created.id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: "OPEN" }),
      });
      await loadEvents();
      setEventId(created.id);
      setShowCreate(false);
      setNewName("");
      setNewLocation("");
      setMsg(`Serata pronta! Comunica il PIN ${created.joinCode} o proietta il QR dallo schermo sala.`);
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(status: string) {
    if (!event) return;
    setMsg(null);
    if (status === "ENDED" && !window.confirm("Chiudere la serata? Il pubblico non potrà più prenotare.")) return;
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
      if (ok) setMsg(`${b.user.nickname} è sul palco! Lo schermo sala parte da solo.`);
    } finally {
      setBusy(null);
    }
  }

  async function end() {
    if (!performing?.performance) return;
    setMsg(null);
    const ok = await adminFetch(`/admin/performances/${performing.performance.id}/end`, { method: "POST" });
    if (ok) setMsg("Esibizione conclusa: punteggio e classifica aggiornati.");
  }

  async function move(b: QueueBooking, direction: "up" | "down") {
    await adminFetch(`/admin/bookings/${b.id}/move`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    });
  }

  async function remove(b: QueueBooking) {
    if (!window.confirm(`Togliere «${bookingTitle(b)}» dalla scaletta?`)) return;
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
      setMsg(track == null ? "Voce guida riattivata." : `Traccia ${track} silenziata (voce guida).`);
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
      setMsg(semitones === 0 ? "Tonalità originale." : `Tonalità ${semitones > 0 ? "+" : ""}${semitones} semitoni.`);
      if (eventId) await loadQueue(eventId);
    }
  }

  /** Rinomina il titolo mostrato per una prenotazione video. */
  async function renameVideo(b: QueueBooking) {
    const t = window.prompt("Titolo da mostrare per questo video:", b.ytTitle ?? "");
    if (t == null || !t.trim()) return;
    setMsg(null);
    const ok = await adminFetch(`/admin/bookings/${b.id}/title`, {
      method: "PUT",
      body: JSON.stringify({ ytTitle: t.trim() }),
    });
    if (ok) setMsg("Titolo aggiornato.");
  }

  /** Bis: rimette il brano in fondo alla scaletta. */
  async function replay(b: QueueBooking) {
    setMsg(null);
    setBusy(b.id);
    try {
      const ok = await adminFetch(`/admin/bookings/${b.id}/replay`, { method: "POST" });
      if (ok) setMsg(`«${bookingTitle(b)}» rimessa in scaletta per il bis.`);
    } finally {
      setBusy(null);
    }
  }

  async function downloadVideo(b: QueueBooking) {
    setMsg(null);
    setBusy(b.id);
    try {
      const ok = await adminFetch(`/admin/youtube/process/${b.id}`, { method: "POST" });
      if (ok) setMsg("Download avviato: a fine download il brano partirà senza pubblicità.");
    } finally {
      setBusy(null);
    }
  }

  // ---- impostazioni audio (solo quando aperte) ----
  const soundfontBankId: SoundfontBankId = getSoundfontBank(event?.soundfontBankId).id;

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
    if (!showAudio) return;
    void loadSf2Files();
    void fetchSfStatus();
  }, [showAudio, loadSf2Files, fetchSfStatus]);

  async function persistSoundfont(id: SoundfontBankId) {
    if (!event) return;
    const ok = await adminFetch(`/admin/events/${event.id}`, {
      method: "PUT",
      body: JSON.stringify({ soundfontBankId: id }),
    });
    if (ok) {
      setMsg("Timbro aggiornato: lo schermo sala userà questo suono.");
      await loadEvents();
    }
  }

  async function syncSoundfont() {
    setSfSyncing(true);
    try {
      const res = await fetch(`${base}/api/admin/soundfonts/${encodeURIComponent(soundfontBankId)}/sync`, {
        method: "POST",
        headers: { ...authHeader() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? "Download suoni fallito");
        return;
      }
      const d = data as { status?: { present: number; total: number; ready: boolean } };
      if (d.status) setSfStatus(d.status);
      setMsg("Suoni pronti sul server.");
    } finally {
      setSfSyncing(false);
    }
  }

  async function uploadSf2(file: File) {
    setSf2Uploading(true);
    setErr(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${base}/api/admin/soundfonts/sf2/upload`, {
        method: "POST",
        headers: { ...authHeader() },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? "Upload fallito");
        return;
      }
      setMsg(`SoundFont «${file.name}» caricato: selezionalo come timbro.`);
      await loadSf2Files();
    } finally {
      setSf2Uploading(false);
      if (sf2InputRef.current) sf2InputRef.current.value = "";
    }
  }

  async function deleteSf2(file: string) {
    if (!window.confirm(`Eliminare «${file}» dal server?`)) return;
    await adminFetch(`/admin/soundfonts/sf2/${encodeURIComponent(file)}`, { method: "DELETE" });
    await loadSf2Files();
  }

  // ---------- render ----------

  return (
    <div className="space-y-6">
      {/* scelta serata */}
      <section className="kg-card p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-sm">
            <span className="text-zinc-400">La tua serata</span>
            <select
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-zinc-100 outline-none ring-fuchsia-500/30 focus:ring-2"
              value={eventId ?? ""}
              onChange={(e) => setEventId(e.target.value || null)}
            >
              <option value="">— scegli una serata —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} · PIN {ev.joinCode}
                  {ev.status === "ENDED" ? " (conclusa)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/15 px-5 py-3 text-sm font-medium text-fuchsia-100 hover:bg-fuchsia-500/25"
          >
            + Nuova serata
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createEvent} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <label className="flex min-w-52 flex-1 flex-col gap-1 text-sm">
              <span className="text-zinc-400">Nome della serata</span>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Karaoke al Bar Sport"
                required
              />
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
              <span className="text-zinc-400">Locale (facoltativo)</span>
              <input
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Bar Sport"
              />
            </label>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40"
            >
              {creating ? "Creazione…" : "Crea e apri"}
            </button>
          </form>
        )}

        {event && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <div>
              <p className="font-display text-lg font-semibold text-white">{event.name}</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                PIN <span className="font-mono text-xl tracking-[0.2em] text-fuchsia-300">{event.joinCode}</span>
                <span className="mx-2 text-zinc-700">·</span>
                <a
                  href={`/display?eventId=${event.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-300 underline-offset-2 hover:underline"
                >
                  apri schermo sala ↗
                </a>
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stato serata">
              {STATUS_STEPS.map((s) => (
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
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-fuchsia-400/90">🎤 Ora sul palco</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-display text-2xl font-semibold text-white">{performing.user.nickname}</p>
                  <p className="mt-1 text-zinc-300">{bookingTitle(performing)}</p>
                </div>
                <div className="flex items-center gap-4">
                  {performing.song?.source === "MIDI" && (
                    <MidiLiveControls
                      song={performing.song}
                      authHeader={authHeader}
                      muteTitle="Silenzia un canale MIDI (es. Ch.04 voce guida). Effetto sul display entro ~2 s anche senza WebSocket."
                      transposeTitle="Trasposizione in semitoni: ha effetto subito sul display, anche a brano in corso"
                      onMute={(track) => void setMutedTrack(performing.song!.id, track)}
                      onTranspose={(semitones) => void setTransposeSemitones(performing.song!.id, semitones)}
                    />
                  )}
                  {performing.song?.source === "YOUTUBE" && (
                    <TransposeLiveControl
                      transpose={performing.song.transposeSemitones ?? 0}
                      title="Trasposizione in semitoni sul video: ha effetto subito sul display"
                      onTranspose={(semitones) => void setTransposeSemitones(performing.song!.id, semitones)}
                    />
                  )}
                  <p className="rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-amber-200">
                    ★ <span className="font-display text-xl font-semibold">{voteAvg != null ? voteAvg.toFixed(1) : "—"}</span>
                    <span className="ml-2 text-xs text-amber-200/70">{voteCount} voti</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void end()}
                    className="rounded-xl bg-zinc-100 px-6 py-3 font-semibold text-zinc-900 hover:bg-white"
                  >
                    ⏹ Concludi e dai il punteggio
                  </button>
                </div>
              </div>
            </section>
          ) : (
            lastScore !== null && (
              <p className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-3 text-fuchsia-100">
                Ultima esibizione: <span className="font-display text-lg font-semibold">{lastScore.toFixed(1)}</span> punti
              </p>
            )
          )}

          {/* richieste da approvare */}
          {pending.length > 0 && (
            <section className="kg-card border-amber-500/30 p-5 md:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-amber-300/90">
                ✋ Richieste in attesa ({pending.length})
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
                        <p className="truncate text-sm text-zinc-400" title={bookingTitle(b)}>
                          {bookingTitle(b)}
                        </p>
                        {b.ytUrl && (
                          <a
                            href={b.ytUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-red-300/80 underline-offset-2 hover:underline"
                          >
                            guarda su YouTube ↗
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={busy === b.id}
                        onClick={() => void approve(b, true)}
                        className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                      >
                        ✓ In scaletta
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
                📋 Scaletta ({upcoming.length})
              </p>
              <p className="text-xs text-zinc-600">Si aggiorna da sola quando il pubblico prenota</p>
            </div>

            {upcoming.length === 0 ? (
              <p className="mt-6 text-center text-sm text-zinc-500">
                Scaletta vuota. Il pubblico prenota dal telefono con il PIN{" "}
                <span className="font-mono text-fuchsia-300">{event.joinCode}</span>.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {upcoming.map((b, i) => (
                  <li
                    key={b.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      i === 0 && !performing ? "border-fuchsia-500/40 bg-fuchsia-500/5" : "border-zinc-800 bg-zinc-950/60"
                    }`}
                  >
                    <span className="w-6 shrink-0 text-center font-mono text-sm text-zinc-600">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white">
                        {b.user.nickname}
                        {b.ytUrl && (
                          <span className="ml-2 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase text-red-200/90">
                            video
                          </span>
                        )}
                        {b.status === "READY" && (
                          <span className="ml-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase text-emerald-200/90">
                            senza pubblicità
                          </span>
                        )}
                        {b.status === "PROCESSING" && (
                          <span className="ml-2 text-xs text-amber-300/90">download…</span>
                        )}
                      </p>
                      <p className="truncate text-sm text-zinc-400" title={bookingTitle(b)}>
                        {bookingTitle(b)}
                      </p>
                      {b.ytProcessError && (
                        <p className="text-xs text-red-400" title={b.ytProcessError}>
                          Download fallito (partirà col player YouTube): {b.ytProcessError.slice(0, 80)}
                          <span className="text-zinc-500"> — spesso si risolve caricando i cookies in 🔧 Tecnico → YouTube</span>
                        </p>
                      )}
                    </div>
                    {b.status !== "PROCESSING" && (
                      <button
                        type="button"
                        disabled={busy === b.id || Boolean(performing)}
                        title={performing ? "C'è già qualcuno sul palco" : "Manda sul palco"}
                        onClick={() => void start(b)}
                        className={
                          i === 0
                            ? "rounded-xl bg-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40"
                            : "rounded-xl border border-fuchsia-500/40 px-4 py-2 text-sm text-fuchsia-200 hover:bg-fuchsia-500/15 disabled:opacity-40"
                        }
                      >
                        ▶ Sul palco
                      </button>
                    )}
                    {b.song?.source === "MIDI" && (
                      <MidiLiveControls
                        song={b.song}
                        className="shrink-0"
                        authHeader={authHeader}
                        muteTitle="Silenzia un canale MIDI (es. Ch.04 voce guida)"
                        transposeTitle="Trasposizione in semitoni per tutte le esecuzioni del brano"
                        onMute={(track) => void setMutedTrack(b.song!.id, track)}
                        onTranspose={(semitones) => void setTransposeSemitones(b.song!.id, semitones)}
                      />
                    )}
                    {b.song?.source === "YOUTUBE" && (
                      <TransposeLiveControl
                        className="shrink-0"
                        transpose={b.song.transposeSemitones ?? 0}
                        title="Trasposizione in semitoni per tutte le esecuzioni del video"
                        onTranspose={(semitones) => void setTransposeSemitones(b.song!.id, semitones)}
                      />
                    )}
                    {b.ytUrl && (
                      <button
                        type="button"
                        title="Rinomina il titolo del video"
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
                        title="Scarica il video sul server: partirà senza pubblicità"
                        onClick={() => void downloadVideo(b)}
                        className="rounded-lg border border-emerald-500/50 px-2.5 py-2 text-xs text-emerald-200 hover:bg-emerald-900/40 disabled:opacity-40"
                      >
                        no ads ⬇
                      </button>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => void move(b, "up")}
                        className="rounded border border-zinc-700 px-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-25"
                        title="Anticipa"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={i >= upcoming.length - 1}
                        onClick={() => void move(b, "down")}
                        className="rounded border border-zinc-700 px-1.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-25"
                        title="Posticipa"
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(b)}
                      className="rounded-lg border border-red-500/40 px-2 py-2 text-xs text-red-300 hover:bg-red-950/40"
                      title="Togli dalla scaletta"
                    >
                      🗑
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* già cantate: bis con un tap */}
          {done.length > 0 && (
            <section className="kg-card p-5 md:p-6">
              <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
                ✅ Già cantate ({done.length})
              </p>
              <ul className="mt-3 space-y-2">
                {done.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-300">
                        <span className="font-medium text-white">{b.user.nickname}</span>
                        <span className="text-zinc-600"> · </span>
                        {bookingTitle(b)}
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
                      title="Rimetti il brano in fondo alla scaletta"
                      onClick={() => void replay(b)}
                      className="shrink-0 rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-40"
                    >
                      ↻ Ripeti
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* impostazioni audio richiudibili */}
          <section className="kg-card p-5 md:p-6">
            <button
              type="button"
              onClick={() => setShowAudio((s) => !s)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">
                🎚 Suono delle basi MIDI
              </span>
              <span className="text-zinc-600">{showAudio ? "▲" : "▼"}</span>
            </button>

            {showAudio && (
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                <div>
                  <SoundfontSelect
                    value={soundfontBankId}
                    onChange={(id) => void persistSoundfont(id)}
                    sf2Files={sf2Files.map((f) => f.file)}
                    id="console-soundfont"
                    label="Timbro (banco sonoro)"
                  />
                  {!isSf2BankId(soundfontBankId) && sfStatus && (
                    <p className="mt-2 text-xs text-zinc-400">
                      Suoni sul server:{" "}
                      <span className="font-mono text-zinc-200">
                        {sfStatus.present}/{sfStatus.total}
                      </span>
                      {sfStatus.ready ? (
                        <span className="ml-2 text-emerald-400/90">— pronti</span>
                      ) : (
                        <span className="ml-2 text-amber-400/90">— scaricali qui sotto (una volta sola)</span>
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
                        {sfSyncing ? "Download in corso…" : "Scarica suoni sul server"}
                      </button>
                    ) : (
                      sfStatus &&
                      !sfStatus.ready && (
                        <p className="mt-3 text-xs text-amber-300/90">
                          Suoni non ancora sul server: chiedi al super admin di scaricarli.
                        </p>
                      )
                    ))}
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    SoundFont personali (.sf2)
                  </p>
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
                            Elimina
                          </button>
                        )}
                      </li>
                    ))}
                    {sf2Files.length === 0 && <li className="text-xs text-zinc-600">Nessun file caricato.</li>}
                  </ul>
                  {isSuper ? (
                    <label className="mt-3 inline-block">
                      <span className="cursor-pointer rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-2 text-sm text-fuchsia-100 hover:bg-fuchsia-500/25">
                        {sf2Uploading ? "Caricamento…" : "Carica .sf2"}
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
                  ) : (
                    <p className="mt-3 text-xs text-zinc-600">
                      Caricamento ed eliminazione gestiti dal super admin.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
