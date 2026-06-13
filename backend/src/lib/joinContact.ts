import { z } from "zod";

export type ParsedJoinContact =
  | { kind: "email"; email: string }
  | { kind: "phone"; phone: string };

/** Solo cifre (spazi ignorati, + opzionale) → telefono; altrimenti email valida. */
export function parseJoinContact(raw: string): ParsedJoinContact | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/\s/g, "");
  const phoneDigits = compact.startsWith("+") ? compact.slice(1) : compact;
  if (/^\d+$/.test(phoneDigits)) {
    if (phoneDigits.length < 6 || phoneDigits.length > 15) return null;
    return { kind: "phone", phone: phoneDigits };
  }

  const emailParsed = z.string().email().safeParse(trimmed.toLowerCase());
  if (emailParsed.success) {
    return { kind: "email", email: emailParsed.data };
  }

  return null;
}
