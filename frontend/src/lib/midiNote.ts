const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Converte un numero MIDI (0–127) nel nome usato da soundfont-player. */
export function midiNumberToName(midi: number): string | null {
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null;
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function formatTransportTime(sec: number): string {
  const safe = Math.max(0, sec);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
