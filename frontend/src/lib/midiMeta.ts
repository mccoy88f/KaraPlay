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
    .replace(/[\x00-\x08\x0e-\x1f]/g, "")
    .replace(/^["'«\s]+|["'»\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Testo copyright, URL o boilerplate: non è un titolo/artista. */
function isJunkMetaText(s: string): boolean {
  const t = clean(s);
  if (!t || t.length < 2) return true;
  const lower = t.toLowerCase();
  if (/^midi$/i.test(t)) return true;
  if (/^www\./i.test(t) || /^https?:\/\//i.test(t)) return true;
  if (/^©|\(c\)|copyright|all rights reserved|rights reserved/i.test(t)) return true;
  if (/^all\s+rights/i.test(lower) || /rights\s+reserved/i.test(lower)) return true;
  if (/^untitled(\s+track|\s*\d*)?$/i.test(lower)) return true;
  if (/^(senza\s+titolo|no\s+title|unknown\s+title)$/i.test(lower)) return true;
  if (/^[\s.\-;:\u0000]+$/i.test(t)) return true;
  if (/^[\x00-\x08\x0e-\x1f]+$/.test(t)) return true;
  return false;
}

function looksLikeTitle(s: string): boolean {
  return s.length >= 2 && s.length <= 80 && !/^@/.test(s) && !isJunkMetaText(s);
}

/** Rimuove parentesi esterne tipiche del karaoke: «(Artista)» → «Artista». */
function normalizeArtist(s: string): string {
  let a = clean(s);
  const wrapped = /^\(([^()]+)\)$/.exec(a);
  if (wrapped) a = clean(wrapped[1]);
  return a;
}

function humanizeFileSegment(s: string): string {
  return clean(s.replace(/_/g, " ").replace(/-/g, " "));
}

/** Nome file tipico karaoke: `Artista--Titolo.mid` o `Artista - Titolo.mid`. */
function parseFileNameMeta(fileName?: string): { title: string; artist: string } {
  if (!fileName) return { title: "", artist: "" };
  const stem = fileName.replace(/\.(mid|midi|kar)$/i, "");
  const double = /^(.+?)--(.+)$/.exec(stem);
  if (double) {
    return {
      artist: normalizeArtist(humanizeFileSegment(double[1])),
      title: humanizeFileSegment(double[2]),
    };
  }
  const spaced = stem.replace(/_+/g, " ");
  const single = /^(.{2,50}?)\s[-–]\s(.{2,80})$/.exec(spaced);
  if (single) {
    return { artist: normalizeArtist(clean(single[1])), title: clean(single[2]) };
  }
  return { title: humanizeFileSegment(stem), artist: "" };
}

/** Molti .kar mettono l'artista tra parentesi nelle prime righe del testo. */
function extractArtistFromLyricLines(lines: { text: string }[]): string {
  for (const l of lines.slice(0, 25)) {
    const text = clean(l.text);
    const m = /^\(([^()]{2,60})\)$/.exec(text);
    if (m && looksLikeTitle(m[1])) return normalizeArtist(m[1]);
    if (text.startsWith("(") && text.endsWith(")")) {
      const inner = normalizeArtist(text);
      if (inner && looksLikeTitle(inner) && !isJunkMetaText(inner)) return inner;
    }
  }
  return "";
}

export type MidiMeta = { title: string; artist: string; year: number | null };

/**
 * Titolo e artista letti dal file MIDI/.kar, in ordine di affidabilità:
 * tag @T → nome traccia → prime righe testo karaoke (artista spesso in «(…)») → nome file
 * (es. `Artista--Titolo.mid`). Sono solo proposte: l'utente le può correggere prima di salvare.
 */
export function extractMidiMeta(buf: ArrayBuffer, fileName?: string): MidiMeta {
  let title = "";
  let artist = "";
  let year: number | null = null;

  const { texts, trackNames } = collectTextMeta(buf);

  // anno: di solito nel meta-evento copyright, es. "(C) 2026 by M-LIVE Srl"
  for (const t of texts) {
    const m = /\b(19[5-9]\d|20\d{2})\b/.exec(t);
    if (m) {
      year = Number(m[1]);
      break;
    }
  }

  // tag karaoke @T: il primo è il titolo, il secondo (se c'è) l'artista
  const tTags = texts.filter((t) => /^@T/i.test(t)).map((t) => clean(t.slice(2)));
  if (tTags[0] && looksLikeTitle(tTags[0])) title = tTags[0];
  if (tTags[1] && looksLikeTitle(tTags[1])) artist = normalizeArtist(tTags[1]);

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
        artist = normalizeArtist(m[2]);
      } else {
        title = name;
      }
    }
  }

  // prime righe del karaoke: spesso «"TITOLO"» e «(ARTISTA)» (salta copyright e URL)
  if (!title || !artist) {
    try {
      const lines = extractMidiLyrics(buf, new Midi(buf));
      if (!title) {
        for (const l of lines.slice(0, 20)) {
          const text = clean(l.text);
          if (!text || isJunkMetaText(text)) continue;
          if (/^\(.+\)$/.test(text)) continue;
          if (looksLikeTitle(text)) {
            title = text;
            break;
          }
        }
      }
      if (!artist) artist = extractArtistFromLyricLines(lines);
    } catch {
      /* senza testi si passa al nome file */
    }
  }

  const fromFile = parseFileNameMeta(fileName);
  if (title && isJunkMetaText(title)) title = "";
  if (artist && isJunkMetaText(artist)) artist = "";
  if (!artist && fromFile.artist && looksLikeTitle(fromFile.artist)) artist = fromFile.artist;
  if (!title && fromFile.title && looksLikeTitle(fromFile.title)) title = fromFile.title;

  if (artist) artist = normalizeArtist(artist);

  return { title, artist, year };
}
