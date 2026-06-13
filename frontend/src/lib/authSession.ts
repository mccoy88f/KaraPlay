import { getStoredEvent, getStoredToken, setStoredEvent, setStoredNickname, setStoredToken } from "../api/client";

type JwtPayload = {
  sub?: string;
  eventId?: string;
  exp?: number;
  role?: string;
};

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** Token guest/user valido e (se fornito) per la stessa serata in memoria. */
export function isGuestSessionValid(expectedEventId?: string | null): boolean {
  const token = getStoredToken();
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.sub || !payload.exp) return false;
  if (payload.exp * 1000 <= Date.now()) return false;
  if (payload.role !== "guest" && payload.role !== "user") return false;
  if (expectedEventId && payload.eventId !== expectedEventId) return false;
  return true;
}

export function clearGuestSession(): void {
  setStoredToken(null);
  setStoredEvent(null);
  setStoredNickname(null);
}

export function guestSessionExpiryMs(): number | null {
  const token = getStoredToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}

/** Allinea UI e storage se il token è assente, scaduto o per un'altra serata. */
export function reconcileGuestSession(): boolean {
  const event = getStoredEvent();
  if (!getStoredToken() && !event) return false;
  if (isGuestSessionValid(event?.id ?? null)) return true;
  clearGuestSession();
  return false;
}
