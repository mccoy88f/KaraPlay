import { useCallback, useEffect, useState } from "react";
import { SoundfontSelect } from "../SoundfontSelect";
import type { SongDto } from "./MidiCatalogSection";
import type { SoundfontBankId } from "../../lib/soundfontBanks";
import { getSoundfontBank } from "../../lib/soundfontBanks";

const base = import.meta.env.VITE_API_URL ?? "";

type QueueBooking = {
  id: string;
  status: string;
  position: number;
  ytUrl: string | null;
  user: { nickname: string };
  song: SongDto | null;
  performance: { id: string } | null;
};

type Props = {
  authHeader: () => Record<string, string>;
};

export function LiveQueueSection({ authHeader }: Props) {
  const [joinCode, setJoinCode] = useState("000000");
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);
  const [soundfontBankId, setSoundfontBankId] = useState<SoundfontBankId>(() => getSoundfontBank(null).id);
  const [eventStatus, setEventStatus] = useState<string>("OPEN");
  const [queue, setQueue] = useState<QueueBooking[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sfStatus, setSfStatus] = useState<{ present: number; total: number; ready: boolean } | null>(null);
  const [sfSyncing, setSfSyncing] = useState(false);

  const loadQueue = useCallback(async () => {
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const evRes = await fetch(`${base}/api/events/${encodeURIComponent(joinCode.trim())}`);
      const ev = await evRes.json().catch(() => ({}));
      if (!evRes.ok) {
        setErr((ev as { error?: string }).error ?? "Serata non trovata");
        setEventId(null);
        setQueue([]);
        return;
      }
      const e = ev as { id: string; name: string; soundfontBankId?: string; status: string };
      setEventId(e.id);
      setEventName(e.name);
      setSoundfontBankId(getSoundfontBank(e.soundfontBankId).id);
      setEventStatus(e.status);

      const qRes = await fetch(`${base}/api/events/${encodeURIComponent(e.id)}/queue`);
      const qData = await qRes.json().catch(() => ({}));
      if (!qRes.ok) {
        setErr((qData as { error?: string }).error ?? "Coda non disponibile");
        setQueue([]);
        return;
      }
      setQueue((qData as { queue: QueueBooking[] }).queue ?? []);
    } finally {
      setLoading(false);
    }
  }, [joinCode]);

  const fetchSfStatus = useCallback(async () => {
    if (!eventId) {
      setSfStatus(null);
      return;
    }
    try {
      const res = await fetch(`${base}/api/admin/soundfonts/${encodeURIComponent(soundfontBankId)}/status`, {
        headers: { ...authHeader() },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && typeof (data as { present?: number }).present === "number") {
        const d = data as { present: number; total: number; ready: boolean };
        setSfStatus({ present: d.present, total: d.total, ready: d.ready });
      } else {
        setSfStatus(null);
      }
    } catch {
      setSfStatus(null);
    }
  }, [base, eventId, soundfontBankId, authHeader]);

  useEffect(() => {
    void fetchSfStatus();
  }, [fetchSfStatus]);

  async function syncSoundfontToServer() {
    if (!eventId) return;
    setErr(null);
    setMsg(null);
    setSfSyncing(true);
    try {
      const res = await fetch(`${base}/api/admin/soundfonts/${encodeURIComponent(soundfontBankId)}/sync`, {
        method: "POST",
        headers: { ...authHeader() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? "Download banco fallito");
        return;
      }
      const d = data as {
        downloaded?: number;
        skipped?: number;
        errors?: { file: string; message: string }[];
        status?: { present: number; total: number; ready: boolean };
      };
      if (d.status) {
        setSfStatus({ present: d.status.present, total: d.status.total, ready: d.status.ready });
      }
      const errCount = d.errors?.length ?? 0;
      if (errCount > 0) {
        setErr(`Alcuni strumenti non sono stati scaricati (${errCount}). Controlla la rete e riprova.`);
      } else {
        setMsg(
          `Banco copiato sul server: nuovi file ${d.downloaded ?? 0}, già presenti ${d.skipped ?? 0}. Il karaoke userà solo questi file, non la rete in tempo reale.`
        );
      }
    } finally {
      setSfSyncing(false);
    }
  }

  async function persistSoundfont(id: SoundfontBankId) {
    if (!eventId) return;
    setErr(null);
    const res = await fetch(`${base}/api/admin/events/${encodeURIComponent(eventId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ soundfontBankId: id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Salvataggio banco fallito");
      void loadQueue();
      return;
    }
    setMsg("Banco sonoro aggiornato (display e player useranno questo timbro).");
  }

  async function persistStatus() {
    if (!eventId) return;
    setErr(null);
    const res = await fetch(`${base}/api/admin/events/${encodeURIComponent(eventId)}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ status: eventStatus }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Aggiornamento stato fallito");
      return;
    }
    setMsg("Stato serata aggiornato. Il pubblico può prenotare solo con stato OPEN o LIVE.");
  }

  async function startBooking(bookingId: string) {
    setErr(null);
    const res = await fetch(`${base}/api/admin/performances/start/${encodeURIComponent(bookingId)}`, {
      method: "POST",
      headers: { ...authHeader() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Avvio fallito");
      return;
    }
    setMsg("Esibizione avviata — apri /display con eventId per il player.");
    await loadQueue();
  }

  async function endPerformance(performanceId: string) {
    setErr(null);
    const res = await fetch(`${base}/api/admin/performances/${encodeURIComponent(performanceId)}/end`, {
      method: "POST",
      headers: { ...authHeader() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Fine esibizione fallita");
      return;
    }
    setMsg("Esibizione terminata.");
    await loadQueue();
  }

  async function moveBooking(bookingId: string, direction: "up" | "down") {
    setErr(null);
    const res = await fetch(`${base}/api/admin/bookings/${encodeURIComponent(bookingId)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ direction }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Spostamento non riuscito");
      return;
    }
    await loadQueue();
  }

  async function removeBooking(bookingId: string, status: string) {
    const msg =
      status === "PERFORMING"
        ? "Interrompere l'esibizione sul display e rimuovere questa voce dalla coda?"
        : "Rimuovere questa prenotazione dalla coda?";
    if (!window.confirm(msg)) return;
    setErr(null);
    const res = await fetch(`${base}/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
      method: "DELETE",
      headers: { ...authHeader() },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((data as { error?: string }).error ?? "Eliminazione non riuscita");
      return;
    }
    setMsg("Voce aggiornata nella coda.");
    await loadQueue();
  }

  return (
    <section className="kg-card mt-8 p-6 md:p-8">
      <h2 className="font-display text-lg font-semibold text-white">Coda live</h2>
      <p className="mt-2 text-sm text-zinc-400">
        PIN serata, stato (prenotazioni consentite solo in <strong className="text-zinc-300">OPEN</strong> o{" "}
        <strong className="text-zinc-300">LIVE</strong>), banco sonoro GM per il display. Poi avvia/termina i brani.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">PIN serata</span>
          <input
            className="w-40 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono outline-none"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void loadQueue()}
          disabled={loading}
          className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-40"
        >
          {loading ? "…" : "Carica coda"}
        </button>
      </div>

      {eventName && eventId && (
        <>
          <p className="mt-3 text-sm text-zinc-300">
            Serata: <span className="font-medium text-white">{eventName}</span>{" "}
            <span className="font-mono text-zinc-500">({eventId})</span>
          </p>

          <div className="mt-6 grid gap-6 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                Stato serata
              </label>
              <p className="text-xs text-zinc-600">
                In <strong className="text-amber-200/90">DRAFT</strong> o <strong className="text-amber-200/90">ENDED</strong>{" "}
                il pubblico non può prenotare.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none"
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value)}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="OPEN">OPEN</option>
                  <option value="LIVE">LIVE</option>
                  <option value="ENDED">ENDED</option>
                </select>
                <button
                  type="button"
                  onClick={() => void persistStatus()}
                  className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/15 px-3 py-2 text-sm text-fuchsia-100 hover:bg-fuchsia-500/25 disabled:opacity-40"
                >
                  Applica stato
                </button>
              </div>
            </div>
            <div>
              <SoundfontSelect
                value={soundfontBankId}
                onChange={(id) => {
                  setSoundfontBankId(id);
                  void persistSoundfont(id);
                }}
                id="queue-soundfont"
                label="Banco sonoro (SF2 / GM)"
              />
              <p className="mt-2 text-xs text-zinc-600">
                Salvato sulla serata: il display usa questo banco. I file strumento vanno copiati una volta sul
                disco del server (non si scaricano dal browser durante il karaoke).
              </p>
              {sfStatus && (
                <p className="mt-2 text-xs text-zinc-400">
                  Strumenti GM sul server:{" "}
                  <span className="font-mono text-zinc-200">
                    {sfStatus.present}/{sfStatus.total}
                  </span>
                  {sfStatus.ready ? (
                    <span className="ml-2 text-emerald-400/90">— banco completo</span>
                  ) : (
                    <span className="ml-2 text-amber-400/90">— avvia il download qui sotto</span>
                  )}
                </p>
              )}
              <div className="mt-3">
                <button
                  type="button"
                  disabled={!eventId || sfSyncing}
                  onClick={() => void syncSoundfontToServer()}
                  className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40"
                >
                  {sfSyncing ? "Download in corso…" : "Scarica banco sul server"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {msg && <p className="mt-4 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Utente</th>
              <th className="py-2 pr-3">Brano</th>
              <th className="py-2 pr-3">Stato</th>
              <th className="py-2 min-w-[14rem]">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((b, index) => (
              <tr key={b.id} className="border-b border-zinc-800/80">
                <td className="py-2 pr-3 font-mono text-zinc-500">{b.position}</td>
                <td className="py-2 pr-3">{b.user.nickname}</td>
                <td className="py-2 pr-3">
                  {b.song ? `${b.song.title} — ${b.song.artist}` : b.ytUrl ?? "—"}
                </td>
                <td className="py-2 pr-3">{b.status}</td>
                <td className="py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      title="Sposta su"
                      disabled={index === 0}
                      onClick={() => void moveBooking(b.id, "up")}
                      className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Sposta giù"
                      disabled={index >= queue.length - 1}
                      onClick={() => void moveBooking(b.id, "down")}
                      className="rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    {(b.status === "APPROVED" || b.status === "READY") && (
                      <button
                        type="button"
                        onClick={() => void startBooking(b.id)}
                        className="rounded bg-fuchsia-600 px-2 py-1 text-xs text-white hover:bg-fuchsia-500 disabled:opacity-40"
                      >
                        Avvia
                      </button>
                    )}
                    {b.status === "PERFORMING" && b.performance && (
                      <button
                        type="button"
                        onClick={() => void endPerformance(b.performance!.id)}
                        className="rounded bg-zinc-600 px-2 py-1 text-xs text-white hover:bg-zinc-500 disabled:opacity-40"
                      >
                        Termina
                      </button>
                    )}
                    <button
                      type="button"
                      title="Rimuovi dalla coda"
                      onClick={() => void removeBooking(b.id, b.status)}
                      className="rounded border border-red-500/50 bg-red-950/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/50"
                    >
                      Elimina
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {queue.length === 0 && eventId && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-zinc-500">
                  Coda vuota — prenota dal flusso /join
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
