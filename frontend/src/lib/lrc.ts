export type LrcLine = { t: number; text: string };

/**
 * Parser LRC base ([mm:ss.xx] o [mm:ss]).
 */
export function parseLrc(text: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const re = /^\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const mm = Number(m[1]);
    const ss = Number(m[2]);
    let frac = 0;
    if (m[3]) {
      const n = Number(m[3]);
      frac = m[3].length === 3 ? n / 1000 : n / 100;
    }
    const t = mm * 60 + ss + frac;
    const line = m[4]?.trim() ?? "";
    if (line) lines.push({ t, text: line });
  }
  return lines.sort((a, b) => a.t - b.t);
}

export function currentLrcIndex(lines: LrcLine[], timeSec: number): number {
  if (lines.length === 0) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= timeSec) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
