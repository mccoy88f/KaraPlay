import { createRequire } from "node:module";
import { gleitzNameForPatch } from "./gmPatchToGleitz.js";

const require = createRequire(import.meta.url);
const { Midi } = require("@tonejs/midi") as {
  Midi: new (data: ArrayBuffer) => {
    duration: number;
    tracks: {
      name: string;
      channel: number;
      instrument: { number: number; family: string; name: string };
      notes: { length: number };
    }[];
  };
};

export type MidiTrackDebug = {
  index: number;
  name: string;
  channel: number;
  isDrum: boolean;
  instrumentNumber: number;
  instrumentName: string;
  noteCount: number;
  /** File gleitz usato dal player per questa traccia (null = solo percussioni Tone). */
  gleitzName: string | null;
};

export type MidiDebugPayload = {
  durationSec: number;
  tracks: MidiTrackDebug[];
  summary: {
    trackCount: number;
    tracksWithNotes: number;
    melodicTracksWithNotes: number;
    drumTracksWithNotes: number;
    totalNotes: number;
    uniqueGleitzInstrumentsToLoad: string[];
  };
  /** Testo pronto da leggere / copiare (log di debug). */
  logLines: string[];
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function analyzeMidiBuffer(buf: Buffer): MidiDebugPayload {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const midi = new Midi(ab);

  const tracks: MidiTrackDebug[] = midi.tracks.map((track, index) => {
    const noteCount = track.notes.length;
    const isDrum = track.channel === 9;
    const gleitzName = isDrum ? null : gleitzNameForPatch(track.instrument.number);
    return {
      index,
      name: track.name || "(senza nome)",
      channel: track.channel,
      isDrum,
      instrumentNumber: track.instrument.number,
      instrumentName: track.instrument.name || `patch ${track.instrument.number}`,
      noteCount,
      gleitzName,
    };
  });

  const withNotes = tracks.filter((t) => t.noteCount > 0);
  const melodic = withNotes.filter((t) => !t.isDrum);
  const drum = withNotes.filter((t) => t.isDrum);
  const totalNotes = withNotes.reduce((a, t) => a + t.noteCount, 0);

  const gleitzSet = new Set<string>();
  for (const t of melodic) {
    if (t.gleitzName) gleitzSet.add(t.gleitzName);
  }
  const uniqueGleitzInstrumentsToLoad = [...gleitzSet];

  const logLines: string[] = [
    "=== Debug MIDI karaoke (KaraokeGame) ===",
    `Durata file: ${formatDuration(midi.duration)} (${midi.duration.toFixed(2)} s)`,
    `È normale avere più tracce (melodia, accordi, basso, batteria, ecc.).`,
    "",
    "Canali: in tabella sotto i numeri sono 1…16 come nel MIDI standard (canale 10 = percussioni GM).",
    "Internamente @tonejs/midi usa 0…15; canale 10 (1-based) = valore 9 in 0-based.",
    "",
    "Riepilogo:",
    `  • Tracce totali nel file: ${tracks.length}`,
    `  • Tracce con almeno una nota: ${withNotes.length}`,
    `  • Tracce melodiche (escluso canale 10 percussioni): ${melodic.length}`,
    `  • Tracce solo batteria/percussioni (canale 10 GM): ${drum.length}`,
    `  • Note totali (tutte le tracce): ${totalNotes}`,
    totalNotes > 2500
      ? `  • Nota: molte note (${totalNotes}): il player deve schedulare in più “spezzoni” per non bloccare il browser.`
      : `  • Note: ${totalNotes} (file corti come test.mid hanno poche centinaia di note).`,
    `  • Strumenti gleitz da caricare (unici): ${uniqueGleitzInstrumentsToLoad.length}`,
    uniqueGleitzInstrumentsToLoad.length
      ? `    → ${uniqueGleitzInstrumentsToLoad.join(", ")}`
      : "    → (nessuno — solo percussione sintetica Tone)",
    "",
    "Dettaglio tracce (canale 1–16; 10 = percussioni → Tone, altri → soundfont gleitz):",
  ];

  for (const t of tracks) {
    if (t.noteCount === 0) {
      logLines.push(
        `  [${t.index}] "${t.name}" | canale ${t.channel + 1} | ${t.isDrum ? "batteria GM" : `GM ${t.instrumentNumber} ${t.instrumentName}`} | 0 note (vuota)`
      );
      continue;
    }
    const role = t.isDrum
      ? "batteria → Tone.PolySynth"
      : `GM ${t.instrumentNumber} ${t.instrumentName} → gleitz "${t.gleitzName}"`;
    logLines.push(
      `  [${t.index}] "${t.name}" | canale ${t.channel + 1} | ${role} | ${t.noteCount} note`
    );
  }

  logLines.push("", "Fine log.");

  return {
    durationSec: midi.duration,
    tracks,
    summary: {
      trackCount: tracks.length,
      tracksWithNotes: withNotes.length,
      melodicTracksWithNotes: melodic.length,
      drumTracksWithNotes: drum.length,
      totalNotes,
      uniqueGleitzInstrumentsToLoad,
    },
    logLines,
  };
}
