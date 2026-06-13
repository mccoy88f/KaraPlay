import { useCallback, useEffect, useState } from "react";
import {
  apiAdminBookMidi,
  apiAdminBookYoutube,
  apiAdminGetParticipants,
  type EventParticipant,
} from "../../api/client";
import { ADMIN_EVENT_KEY } from "../../lib/adminEvent";
import { BookCatalogCore } from "../BookCatalog";

const base = import.meta.env.VITE_API_URL ?? "";

type AdminEvent = {
  id: string;
  name: string;
  location: string;
  date: string;
  status: string;
  joinCode: string;
};

type Props = {
  authHeader: () => Record<string, string>;
};

export function AdminBookSection({ authHeader }: Props) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventId, setEventId] = useState<string | null>(() => localStorage.getItem(ADMIN_EVENT_KEY));
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [newNickname, setNewNickname] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const event = events.find((e) => e.id === eventId) ?? null;

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/admin/events`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEvents(((data as { events: AdminEvent[] }).events ?? []));
    } catch {
      setErr("Serate non disponibili.");
    }
  }, [authHeader]);

  const loadParticipants = useCallback(async () => {
    if (!eventId) {
      setParticipants([]);
      return;
    }
    try {
      const list = await apiAdminGetParticipants(eventId, authHeader);
      setParticipants(list);
      setAssignUserId((cur) => cur || list[0]?.id || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Partecipanti non disponibili");
    }
  }, [eventId, authHeader]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!eventId) return;
    localStorage.setItem(ADMIN_EVENT_KEY, eventId);
    setAssignUserId("");
    setNewNickname("");
    void loadParticipants();
  }, [eventId, loadParticipants]);

  function resolveAssignee(): { userId?: string; nickname?: string } {
    const nick = newNickname.trim();
    if (nick) return { nickname: nick };
    if (assignUserId) return { userId: assignUserId };
    throw new Error("Scegli un partecipante o scrivi un nickname.");
  }

  if (events.length === 0 && !eventId) {
    return (
      <div className="kg-card p-6 text-sm text-zinc-400">
        Crea o seleziona una serata dalla scheda <strong className="text-zinc-200">Conduzione</strong>, poi torna qui
        per prenotare a nome di un partecipante.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-400">{err}</p>}

      <div className="kg-card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-1 text-sm">
          <span className="text-zinc-400">Serata</span>
          <select
            className="kg-input"
            value={eventId ?? ""}
            onChange={(e) => setEventId(e.target.value || null)}
          >
            <option value="">— scegli —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({ev.status})
              </option>
            ))}
          </select>
        </label>
      </div>

      {event && eventId && (
        <div className="kg-card overflow-hidden p-0">
          <BookCatalogCore
            eventId={eventId}
            eventName={event.name}
            onBooked={() => void loadParticipants()}
            assignBar={
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                <p className="text-sm font-medium text-cyan-100">Assegna il brano a</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-zinc-400">Partecipante in sala</span>
                    <select
                      className="kg-input"
                      value={assignUserId}
                      onChange={(e) => {
                        setAssignUserId(e.target.value);
                        setNewNickname("");
                      }}
                    >
                      {participants.length === 0 && <option value="">— nessuno ancora —</option>}
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-zinc-400">Oppure nuovo nickname</span>
                    <input
                      className="kg-input"
                      value={newNickname}
                      onChange={(e) => {
                        setNewNickname(e.target.value);
                        if (e.target.value.trim()) setAssignUserId("");
                      }}
                      placeholder="es. Mario"
                      maxLength={40}
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  I video YouTube prenotati dall&apos;host entrano direttamente in coda (senza approvazione).
                </p>
              </div>
            }
            bookMidi={async (songId) => {
              await apiAdminBookMidi(eventId, songId, resolveAssignee(), authHeader);
            }}
            bookYoutube={async (url, title) => {
              await apiAdminBookYoutube(eventId, url, { ...resolveAssignee(), ytTitle: title }, authHeader);
            }}
            midiBookedMessage={(title) => `«${title}» aggiunto in coda.`}
            ytBookedMessage={(title) => `«${title}» aggiunto in coda.`}
          />
        </div>
      )}
    </div>
  );
}
