const base = import.meta.env.VITE_API_URL ?? "";

export type JoinResponse = {
  token: string;
  user: { id: string; nickname: string };
  event: {
    id: string;
    name: string;
    joinCode: string;
    status: string;
    /** Banco GM scelto dall'host (admin). */
    soundfontBankId?: string;
  };
};

export async function apiJoin(nickname: string, eventJoinCode: string): Promise<JoinResponse> {
  const res = await fetch(`${base}/api/auth/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname, eventJoinCode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Errore di rete");
  }
  return data as JoinResponse;
}

export async function apiGetEvent(joinCode: string) {
  const res = await fetch(`${base}/api/events/${encodeURIComponent(joinCode)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Serata non trovata");
  }
  return data;
}

const TOKEN_KEY = "karaoke_token";
const EVENT_KEY = "karaoke_event";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function setStoredEvent(event: JoinResponse["event"]) {
  localStorage.setItem(EVENT_KEY, JSON.stringify(event));
}

export function getStoredEvent(): JoinResponse["event"] | null {
  const raw = localStorage.getItem(EVENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JoinResponse["event"];
  } catch {
    return null;
  }
}

export async function apiGetQueue(eventId: string) {
  const res = await fetch(`${base}/api/events/${encodeURIComponent(eventId)}/queue`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Coda non disponibile");
  }
  return data as { queue: unknown[]; soundfontBankId?: string };
}

export type LivePerformancePayload = {
  performance: { id: string };
  song: {
    id: string;
    title: string;
    artist: string;
    source: string;
    midiPath: string | null;
    lrcPath: string | null;
  };
  user: { nickname: string };
};

export async function apiGetLivePerformance(eventId: string): Promise<{ live: LivePerformancePayload | null }> {
  const res = await fetch(`${base}/api/events/${encodeURIComponent(eventId)}/live`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Stato live non disponibile");
  }
  return data as { live: LivePerformancePayload | null };
}

export type SongDto = {
  id: string;
  title: string;
  artist: string;
  source: string;
  duration: number | null;
};

export async function apiSearchSongs(q?: string): Promise<{ songs: SongDto[] }> {
  const url = q?.trim()
    ? `${base}/api/songs?q=${encodeURIComponent(q.trim())}`
    : `${base}/api/songs`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Catalogo non disponibile");
  }
  return data as { songs: SongDto[] };
}

export async function apiBookMidi(eventId: string, songId: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Sessione scaduta: entra di nuovo");
  const res = await fetch(`${base}/api/events/${encodeURIComponent(eventId)}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ songId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Prenotazione fallita");
  }
}
