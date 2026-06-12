import { Midi } from "@tonejs/midi";
import { extractMidiLyrics } from "./midiLyrics";

/** Legge una quantità variable-length MIDI; ritorna [valore, nuova posizione]. */
function readVarLen(d: Uint8Array, pos: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 4 && pos < d.length; i++) {
    const b = d[pos++];
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return [value, pos];
}

/** Meta-eventi testuali del file: text (FF01), copyright (FF02), nomi traccia (FF03). */
function collectTextMeta(buf: ArrayBuffer): { texts: string[]; trackNames: string[] } {
  const d = new Uint8Array(buf);
  const texts: string[] = [];
  const trackNames: string[] = [];
  if (d.length < 14 || d[0] !== 0x4d || d[1] !== 0x54 || d[2] !== 0x68 || d[3] !== 0x64) {
    return { texts, trackNames };
  }
  const decoder = new TextDecoder("latin1");

  let pos = 8 + ((d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7]);
  while (pos + 8 <= d.length) {
    const isTrack = d[pos] === 0x4d && d[pos + 1] === 0x54 && d[pos + 2] === 0x72 && d[pos + 3] === 0x6b;
    const chunkLen = (d[pos + 4] << 24) | (d[pos + 5] << 16) | (d[pos + 6] << 8) | d[pos + 7];
    let p = pos + 8;
    const end = Math.min(p + chunkLen, d.length);
    pos = end;
    if (!isTrack) continue;

    let runningStatus = 0;
    while (p < end) {
      let skip: number;
      [skip, p] = readVarLen(d, p); // delta time (non serve)
      void skip;
      if (p >= end) break;

      let status = d[p];
      if (status === 0xff) {
        const type = d[p + 1];
        let len: number;
        [len, p] = readVarLen(d, p + 2);
        if (type === 0x01 || type === 0x02) {
          const t = decoder.decode(d.subarray(p, p + len)).trim();
          if (t) texts.push(t);
        } else if (type === 0x03) {
          const t = decoder.decode(d.subarray(p, p + len)).trim();
          if (t) trackNames.push(t);
        }
        p += len;
      } else if (status === 0xf0 || status === 0xf7) {
        let len: number;
        [len, p] = readVarLen(d, p + 1);
        p += len;
      } else {
        if (status < 0x80) {
          status = runningStatus;
          p -= 1;
        }
        runningStatus = status;
        const kind = status & 0xf0;
        p += kind === 0xc0 || kind === 0xd0 ? 2 : 3;
      }
    }
  }
  return { texts, trackNames };
}

function clean(s: string): string {
  return s
    .replace(/^["'«\s]+|["'»\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeTitle(s: string): boolean {
  return s.length >= 2 && s.length <= 80 && !/^@/.test(s);
}

export type MidiMeta = { title: string; artist: string };

/**
 * Titolo e artista letti dal file MIDI/.kar, in ordine di affidabilità:
 * tag @T dei .kar (primo = titolo, secondo = artista) → nome della prima traccia
 * → prime righe del testo karaoke (molti file mettono lì "TITOLO" e "(ARTISTA)")
 * → nome del file. Sono solo proposte: l'utente le può correggere prima di salvare.
 */
export function extractMidiMeta(buf: ArrayBuffer, fileName?: string): MidiMeta {
  let title = "";
  let artist = "";

  const { texts, trackNames } = collectTextMeta(buf);

  // tag karaoke @T: il primo è il titolo, il secondo (se c'è) l'artista
  const tTags = texts.filter((t) => /^@T/i.test(t)).map((t) => clean(t.slice(2)));
  if (tTags[0] && looksLikeTitle(tTags[0])) title = tTags[0];
  if (tTags[1] && looksLikeTitle(tTags[1])) artist = tTags[1];

  // nome della prima traccia (tonejs lo espone come midi.name)
  if (!title) {
    let name = "";
    try {
      name = clean(new Midi(buf).name);
    } catch {
      name = clean(trackNames[0] ?? "");
    }
    if (name && looksLikeTitle(name)) {
      // alcuni cataloghi usano "Titolo - Artista" nel nome traccia
      const m = /^(.{2,60}?)\s[-–]\s(.{2,40})$/.exec(name);
      if (m && !artist) {
        title = clean(m[1]);
        artist = clean(m[2]);
      } else {
        title = name;
      }
    }
  }

  // prime righe del karaoke: spesso «"TITOLO"» e «(ARTISTA)»
  if (!title || !artist) {
    try {
      const lines = extractMidiLyrics(buf, new Midi(buf)).slice(0, 3);
      if (!title && lines[0] && looksLikeTitle(clean(lines[0].text))) {
        title = clean(lines[0].text);
      }
      if (!artist) {
        for (const l of lines) {
          const m = /^\(([^()]{2,40})\)$/.exec(clean(l.text));
          if (m) {
            artist = clean(m[1]);
            break;
          }
        }
      }
    } catch {
      /* senza testi si passa al nome file */
    }
  }

  if (!title && fileName) {
    title = clean(
      fileName
        .replace(/\.(mid|midi|kar)$/i, "")
        .replace(/[_]+/g, " ")
        .replace(/\s*-\s*/g, " - ")
    );
  }

  return { title, artist };
}
