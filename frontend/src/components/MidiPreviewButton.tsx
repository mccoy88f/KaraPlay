import { useEffect, useRef, useState } from "react";
import { Midi } from "@tonejs/midi";
import Soundfont from "soundfont-player";
import { gleitzNameForPatch } from "../lib/gmPatchToGleitz";

const base = import.meta.env.VITE_API_URL ?? "";
const PREVIEW_SECONDS = 25;
/** L'anteprima usa sempre Fluid R3 (leggero); al massimo 3 strumenti per non pesare sul telefono. */
const PREVIEW_FOLDER = "FluidR3_GM";
const MAX_INSTRUMENTS = 3;

let sharedCtx: AudioContext | null = null;
/** Una sola anteprima alla volta: avviarne una ferma la precedente. */
let stopCurrent: (() => void) | null = null;

type Status = "idle" | "loading" | "playing" | "error";

export function MidiPreviewButton({ songId }: { songId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const myStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      myStopRef.current?.();
    };
  }, []);

  function stop() {
    myStopRef.current?.();
    myStopRef.current = null;
    setStatus("idle");
  }

  async function play() {
    stopCurrent?.();
    setStatus("loading");
    try {
      if (!sharedCtx) sharedCtx = new AudioContext();
      const ac = sharedCtx;
      await ac.resume();

      const res = await fetch(`${base}/api/media/song/${encodeURIComponent(songId)}/midi`);
      if (!res.ok) throw new Error("MIDI non trovato");
      const midi = new Midi(await res.arrayBuffer());

      // le 3 tracce più ricche di note nei primi secondi: bastano per riconoscere il brano
      const tracks = midi.tracks
        .filter((t) => t.channel !== 9 && t.notes.some((n) => n.time < PREVIEW_SECONDS))
        .sort(
          (a, b) =>
            b.notes.filter((n) => n.time < PREVIEW_SECONDS).length -
            a.notes.filter((n) => n.time < PREVIEW_SECONDS).length
        )
        .slice(0, MAX_INSTRUMENTS);
      if (tracks.length === 0) throw new Error("Anteprima non disponibile per questo file");

      const nameToUrl = (name: string, _sf: string, format: string) => {
        const fmt = format === "ogg" ? "ogg" : "mp3";
        return `${base}/api/media/soundfont/${PREVIEW_FOLDER}/${encodeURIComponent(`${name}-${fmt}.js`)}`;
      };

      const players = new Map<string, Awaited<ReturnType<typeof Soundfont.instrument>>>();
      await Promise.all(
        [...new Set(tracks.map((t) => gleitzNameForPatch(t.instrument.number)))].map(async (name) => {
          players.set(
            name,
            await Soundfont.instrument(ac, name as Parameters<typeof Soundfont.instrument>[1], {
              nameToUrl,
              format: "mp3",
            })
          );
        })
      );

      const t0 = ac.currentTime + 0.15;
      const firstNote = Math.min(...tracks.flatMap((t) => (t.notes[0] ? [t.notes[0].time] : [])));
      for (const track of tracks) {
        const inst = players.get(gleitzNameForPatch(track.instrument.number))!;
        for (const note of track.notes) {
          // si parte dalla prima nota, non dall'eventuale silenzio iniziale
          const rel = note.time - firstNote;
          if (rel < 0 || rel > PREVIEW_SECONDS) continue;
          try {
            inst.play(note.name, t0 + rel, {
              duration: Math.max(0.02, note.duration),
              gain: Math.max(0.05, note.velocity ?? 0.7),
            });
          } catch {
            /* nota fuori range: si continua */
          }
        }
      }

      const timer = window.setTimeout(() => stop(), PREVIEW_SECONDS * 1000);
      const doStop = () => {
        window.clearTimeout(timer);
        for (const p of players.values()) {
          try {
            p.stop?.();
          } catch {
            /* già fermo */
          }
        }
        players.clear();
        if (stopCurrent === doStop) stopCurrent = null;
      };
      myStopRef.current = doStop;
      stopCurrent = doStop;
      setStatus("playing");
    } catch (e) {
      console.error("[preview]", e);
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  if (status === "error") {
    return (
      <span className="shrink-0 rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-200/90">
        anteprima n/d
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={status === "loading"}
      onClick={() => (status === "playing" ? stop() : void play())}
      title={status === "playing" ? "Ferma l'anteprima" : "Ascolta un'anteprima"}
      className="shrink-0 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
    >
      {status === "loading" ? "…" : status === "playing" ? "⏹" : "▶"}
    </button>
  );
}
