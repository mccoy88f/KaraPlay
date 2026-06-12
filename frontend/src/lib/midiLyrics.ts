import type { Midi } from "@tonejs/midi";
import type { LrcLine } from "./lrc";

type LyricEvent = { tick: number; text: string };

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

/**
 * Estrae gli eventi testo karaoke dal file MIDI grezzo: meta lyric (FF 05) oppure,
 * in assenza, meta text (FF 01) come usano molti file .kar.
 * @tonejs/midi non espone questi eventi, quindi il file va riletto byte per byte.
 */
function extractLyricEvents(buf: ArrayBuffer): LyricEvent[] {
  const d = new Uint8Array(buf);
  if (d.length < 14 || d[0] !== 0x4d || d[1] !== 0x54 || d[2] !== 0x68 || d[3] !== 0x64) {
    return [];
  }
  const lyrics: LyricEvent[] = [];
  const texts: LyricEvent[] = [];
  const decoder = new TextDecoder("latin1");

  let pos = 8 + ((d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7]);
  while (pos + 8 <= d.length) {
    const isTrack = d[pos] === 0x4d && d[pos + 1] === 0x54 && d[pos + 2] === 0x72 && d[pos + 3] === 0x6b;
    const chunkLen = (d[pos + 4] << 24) | (d[pos + 5] << 16) | (d[pos + 6] << 8) | d[pos + 7];
    let p = pos + 8;
    const end = Math.min(p + chunkLen, d.length);
    pos = end;
    if (!isTrack) continue;

    let tick = 0;
    let runningStatus = 0;
    while (p < end) {
      let delta: number;
      [delta, p] = readVarLen(d, p);
      tick += delta;
      if (p >= end) break;

      let status = d[p];
      if (status === 0xff) {
        const type = d[p + 1];
        let len: number;
        [len, p] = readVarLen(d, p + 2);
        if (type === 0x05 || type === 0x01) {
          const text = decoder.decode(d.subarray(p, p + len));
          (type === 0x05 ? lyrics : texts).push({ tick, text });
        }
        p += len;
      } else if (status === 0xf0 || status === 0xf7) {
        let len: number;
        [len, p] = readVarLen(d, p + 1);
        p += len;
      } else {
        if (status < 0x80) {
          // running status: questo byte è già il primo data byte
          status = runningStatus;
          p -= 1;
        }
        runningStatus = status;
        const kind = status & 0xf0;
        p += kind === 0xc0 || kind === 0xd0 ? 2 : 3;
      }
    }
  }

  return lyrics.length > 0 ? lyrics : texts;
}

/**
 * Converte gli eventi sillaba in righe sincronizzate (convenzioni karaoke:
 * \r, \n e "/" iniziano una nuova riga; "\" un nuovo paragrafo; i prefissi
 * @… dei file .kar sono metadati e vengono scartati).
 */
export function extractMidiLyrics(buf: ArrayBuffer, midi: Midi): LrcLine[] {
  const events = extractLyricEvents(buf);
  if (events.length === 0) return [];

  const lines: LrcLine[] = [];
  let current = "";
  let lineTick: number | null = null;

  const flush = () => {
    const text = current.replace(/[\r\n]/g, "").trim();
    if (text && lineTick != null) {
      lines.push({ t: midi.header.ticksToSeconds(lineTick), text });
    }
    current = "";
    lineTick = null;
  };

  for (const ev of events) {
    let text = ev.text;
    if (text.startsWith("@") || text.startsWith("%")) continue; // metadati .kar
    if (/^[\r\n]+$/.test(text) || text === "/" || text === "\\") {
      flush();
      continue;
    }
    if (/^[\r\n/\\]/.test(text)) {
      flush();
      text = text.replace(/^[\r\n/\\]+/, "");
    }
    if (current === "") lineTick = ev.tick;
    current += text;
    if (/[\r\n]$/.test(text)) flush();
  }
  flush();

  return lines.sort((a, b) => a.t - b.t);
}
