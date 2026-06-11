import { useCallback, useEffect, useState } from "react";

const base = import.meta.env.VITE_API_URL ?? "";

type AdminEvent = {
  id: string;
  name: string;
  location: string;
  date: string;
  status: string;
  joinCode: string;
  _count: { bookings: number; performances: number };
};

type Props = {
  authHeader: () => Record<string, string>;
};

function todayLocalIso(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function EventsSection({ authHeader }: Props) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(todayLocalIso());
  const [pin, setPin] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`${base}/api/admin/events`, { headers: { ...authHeader() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? "Elenco serate non disponibile");
        return;
      }
      setEvents((data as { events: AdminEvent[] }).events ?? []);
    } catch {
      setErr("Elenco serate non disponibile");
    }
  }, [authHeader]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setCreating(true);
    try {
      const res = await fetch(`${base}/api/admin/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          name: name.trim(),
          location: location.trim(),
          date: new Date(`${date}T20:00:00`).toISOString(),
          ...(pin.trim() ? { joinCode: pin.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((data as { error?: string }).error ?? "Creazione fallita");
        return;
      }
      const created = data as AdminEvent;
      setMsg(
        `Serata «${created.name}» creata con PIN ${created.joinCode}. È in DRAFT: aprila dalla sezione Coda live per accettare il pubblico.`
      );
      setName("");
      setLocation("");
      setPin("");
      await loadEvents();
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="kg-card mt-8 p-6 md:p-8">
      <h2 className="font-display text-lg font-semibold text-white">Serate</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Crea una serata e comunica il PIN al pubblico (o proietta il QR dal display). Lo stato si gestisce
        dalla sezione <strong className="text-zinc-300">Coda live</strong>.
      </p>

      <form onSubmit={createEvent} className="mt-5 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Nome serata</span>
          <input
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Karaoke Night"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Locale / luogo</span>
          <input
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Bar dello Sport"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">Data</span>
          <input
            type="date"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-400">PIN (vuoto = generato)</span>
          <input
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono outline-none"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="es. 123456"
            minLength={4}
            maxLength={32}
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={creating || !name.trim() || !location.trim()}
            className="rounded-lg bg-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-40"
          >
            {creating ? "Creazione…" : "Crea serata"}
          </button>
        </div>
      </form>

      {msg && <p className="mt-4 text-sm text-emerald-400">{msg}</p>}
      {err && <p className="mt-4 text-sm text-red-400">{err}</p>}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500">
              <th className="py-2 pr-3">Serata</th>
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">PIN</th>
              <th className="py-2 pr-3">Stato</th>
              <th className="py-2">Prenotazioni</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className="border-b border-zinc-800/80">
                <td className="py-2 pr-3">
                  <span className="font-medium text-white">{ev.name}</span>
                  <span className="ml-2 text-xs text-zinc-600">{ev.location}</span>
                </td>
                <td className="py-2 pr-3 text-zinc-400">{new Date(ev.date).toLocaleDateString()}</td>
                <td className="py-2 pr-3 font-mono text-fuchsia-300">{ev.joinCode}</td>
                <td className="py-2 pr-3">{ev.status}</td>
                <td className="py-2 text-zinc-400">
                  {ev._count.bookings} <span className="text-zinc-600">({ev._count.performances} esibizioni)</span>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-zinc-500">
                  Nessuna serata: creane una qui sopra.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
