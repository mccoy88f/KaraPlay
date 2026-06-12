import { Midi } from "@tonejs/midi";
import { encode } from "@tonejs/midi/dist/Encode.js";

/** Numero traccia MIDI 1-based (come in console admin), o null = nessuna muta. */
export type MutedTrack = number | null;

export function normalizeMutedTrack(value: unknown): MutedTrack {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * Copia del buffer MIDI con la traccia indicata svuotata (note, pitch bend, CC).
 * Usato dal motore SF2: il sequencer non suona eventi che non esistono più.
 */
export function buildPlaybackMidiBuffer(source: ArrayBuffer, mutedTrack: MutedTrack): ArrayBuffer {
  if (mutedTrack == null) return source.slice(0);
  const idx = mutedTrack - 1;
  const midi = new Midi(source.slice(0));
  if (idx < 0 || idx >= midi.tracks.length) return source.slice(0);
  const track = midi.tracks[idx];
  track.notes = [];
  track.pitchBends = [];
  for (const cc of Object.keys(track.controlChanges)) {
    track.controlChanges[Number(cc)] = [];
  }
  const encoded = encode(midi);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
}

/** Canali MIDI usati da una traccia (0–15), ricavati dalle note. */
export function channelsForTrack(midi: Midi, trackNumber: number): number[] {
  const track = midi.tracks[trackNumber - 1];
  if (!track) return [];
  const ch = new Set<number>();
  if (Number.isInteger(track.channel)) ch.add(track.channel);
  for (const note of track.notes) {
    const n = note as { channel?: number };
    if (Number.isInteger(n.channel)) ch.add(n.channel!);
  }
  return [...ch];
}
