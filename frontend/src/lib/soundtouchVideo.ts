import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import soundtouchProcessorUrl from "@soundtouchjs/audio-worklet/processor?url";

export type SoundTouchVideoSession = {
  ctx: AudioContext;
  node: SoundTouchNode;
  dispose: () => void;
};

/** Evita di registrare più volte il worklet sullo stesso AudioContext. */
const registeredContexts = new WeakSet<BaseAudioContext>();

/**
 * Instrada l'audio del video attraverso SoundTouch (pitch in semitoni, tempo invariato).
 * Il video va muto: l'audio esce solo dal grafo Web Audio.
 */
export async function connectSoundTouchVideo(
  video: HTMLVideoElement,
  semitones: number
): Promise<SoundTouchVideoSession> {
  video.preservesPitch = false;
  video.muted = true;
  video.playbackRate = 1;

  const ctx = new AudioContext({ latencyHint: "playback" });
  if (!registeredContexts.has(ctx)) {
    await SoundTouchNode.register(ctx, soundtouchProcessorUrl);
    registeredContexts.add(ctx);
  }

  const node = new SoundTouchNode({ context: ctx });
  node.connect(ctx.destination);
  const source = ctx.createMediaElementSource(video);
  source.connect(node);
  node.playbackRate.value = 1;
  node.pitchSemitones.value = semitones;

  return {
    ctx,
    node,
    dispose: () => {
      try {
        source.disconnect();
      } catch {
        /* già scollegato */
      }
      try {
        node.disconnect();
      } catch {
        /* già scollegato */
      }
      void ctx.close().catch(() => {});
    },
  };
}
