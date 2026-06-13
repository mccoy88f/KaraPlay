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
const NICKNAME_KEY = "karaoke_nickname";

export function setStoredNickname(nickname: string | null) {
  if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
  else localStorage.removeItem(NICKNAME_KEY);
}

export function getStoredNickname(): string | null {
  return localStorage.getItem(NICKNAME_KEY);
}

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
  booking?: { id: string; ytUrl?: string | null; ytTitle?: string | null };
  song: {
    id: string;
    title: string;
    artist: string;
    source: string;
    midiPath: string | null;
    lrcPath: string | null;
    mutedTrack?: number | null;
    transposeSemitones?: number;
  } | null;
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
  fileName?: string | null;
  year?: number | null;
  genre?: string | null;
};

export async function apiSearchSongs(
  eventId: string,
  q?: string,
  limit = 40,
  offset = 0,
  signal?: AbortSignal
): Promise<{ songs: SongDto[]; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  const res = await fetch(`${base}/api/events/${encodeURIComponent(eventId)}/songs?${params}`, { signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Catalogo non disponibile");
  }
  return data as { songs: SongDto[]; hasMore: boolean };
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

export async function apiGetEventById(eventId: string) {
  const res = await fetch(`${base}/api/events/by-id/${encodeURIComponent(eventId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Serata non trovata");
  }
  return data as {
    id: string;
    name: string;
    location: string;
    date: string;
    status: string;
    joinCode: string;
    soundfontBankId?: string;
  };
}

export type VoteStats = {
  avg: number;
  count: number;
  distribution: Record<number, number>;
  myVote?: number | null;
};

export async function apiVote(performanceId: string, value: number): Promise<VoteStats> {
  const token = getStoredToken();
  if (!token) throw new Error("Sessione scaduta: entra di nuovo");
  const res = await fetch(`${base}/api/performances/${encodeURIComponent(performanceId)}/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Voto non registrato");
  }
  return data as VoteStats;
}

export async function apiGetVotes(performanceId: string): Promise<VoteStats> {
  const token = getStoredToken();
  const res = await fetch(`${base}/api/performances/${encodeURIComponent(performanceId)}/votes`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Voti non disponibili");
  }
  return data as VoteStats;
}

export type CommentDto = {
  id: string;
  text: string;
  emoji: string | null;
  createdAt: string;
  user: { nickname: string };
};

export async function apiSendComment(performanceId: string, text: string, emoji?: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Sessione scaduta: entra di nuovo");
  const res = await fetch(`${base}/api/performances/${encodeURIComponent(performanceId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, ...(emoji ? { emoji } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Commento non inviato");
  }
}

export async function apiGetComments(performanceId: string): Promise<{ comments: CommentDto[] }> {
  const res = await fetch(`${base}/api/performances/${encodeURIComponent(performanceId)}/comments`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Commenti non disponibili");
  }
  return data as { comments: CommentDto[] };
}

export type LeaderboardEntry = {
  userId: string;
  nickname: string;
  avgScore: number;
  bestScore: number;
  performances: number;
};

export async function apiGetEventLeaderboard(eventId: string): Promise<{ entries: LeaderboardEntry[] }> {
  const res = await fetch(`${base}/api/events/${encodeURIComponent(eventId)}/leaderboard`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Classifica non disponibile");
  }
  return data as { entries: LeaderboardEntry[] };
}

export async function apiGetGlobalLeaderboard(): Promise<{ entries: LeaderboardEntry[] }> {
  const res = await fetch(`${base}/api/leaderboard/global`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Classifica non disponibile");
  }
  return data as { entries: LeaderboardEntry[] };
}

export type MyStats = {
  nickname: string;
  email: string | null;
  emailVerified: boolean;
  performances: number;
  avgScore: number | null;
  bestScore: number | null;
};

export async function apiGetMyStats(): Promise<MyStats> {
  const token = getStoredToken();
  if (!token) throw new Error("Sessione scaduta: entra di nuovo");
  const res = await fetch(`${base}/api/users/me/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Statistiche non disponibili");
  }
  return data as MyStats;
}

export async function apiRequestOtp(email: string): Promise<void> {
  const res = await fetch(`${base}/api/auth/request-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Invio OTP fallito");
  }
}

export async function apiVerifyOtp(email: string, code: string): Promise<{ token: string }> {
  const token = getStoredToken();
  if (!token) throw new Error("Sessione scaduta: entra di nuovo");
  const res = await fetch(`${base}/api/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Verifica fallita");
  }
  return data as { token: string };
}

export type YoutubeSearchResult = {
  id: string;
  url: string;
  title: string;
  channel: string;
  duration: number | null;
  thumbnail: string | null;
};

export async function apiSearchYoutube(
  eventId: string,
  q: string,
  limit = 10,
  offset = 0,
  signal?: AbortSignal
): Promise<{ results: YoutubeSearchResult[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    q: q.trim(),
    limit: String(limit),
    offset: String(offset),
  });
  const res = await fetch(`${base}/api/events/${encodeURIComponent(eventId)}/youtube/search?${params}`, {
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Ricerca YouTube non disponibile");
  }
  return data as { results: YoutubeSearchResult[]; hasMore: boolean };
}

export async function apiBookYoutube(eventId: string, ytUrl: string, ytTitle?: string): Promise<void> {
  const token = getStoredToken();
  if (!token) throw new Error("Sessione scaduta: entra di nuovo");
  const res = await fetch(`${base}/api/events/${encodeURIComponent(eventId)}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ytUrl, ...(ytTitle ? { ytTitle } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Prenotazione fallita");
  }
}
