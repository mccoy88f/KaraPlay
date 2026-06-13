/** Solo cifre (spazi ignorati, + opzionale) → telefono; altrimenti email. */
export function isJoinContactValid(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 3) return false;

  const compact = trimmed.replace(/\s/g, "");
  const phoneDigits = compact.startsWith("+") ? compact.slice(1) : compact;
  if (/^\d+$/.test(phoneDigits)) {
    return phoneDigits.length >= 6 && phoneDigits.length <= 15;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function joinContactInputMode(raw: string): "numeric" | "email" | "text" {
  const trimmed = raw.trim();
  if (!trimmed) return "text";
  const compact = trimmed.replace(/\s/g, "");
  const phoneDigits = compact.startsWith("+") ? compact.slice(1) : compact;
  if (/^\d+$/.test(phoneDigits)) return "numeric";
  if (trimmed.includes("@")) return "email";
  return "text";
}
