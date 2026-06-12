import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import soundtouchProcessorUrl from "@soundtouchjs/audio-worklet/processor?url";

export type SoundTouchVideoSession = {
  ctx: AudioContext;
  node: SoundTouchNode;
  source: MediaElementAudioSourceNode;
  dispose: () => void;
};

/** Evita di registrare più volte il worklet sullo stesso AudioContext. */
const registeredContexts = new WeakSet<BaseAudioContext>();

/**
 * Instrada l'audio del video attraverso SoundTouch (pitch in semitoni, tempo invariato).
 * Non impostare `video.muted`: con MediaElementSource un elemento muto produce silenzio nel grafo.
 */
export async function connectSoundTouchVideo(
  video: HTMLVideoElement,
  semitones: number
): Promise<SoundTouchVideoSession> {
  if (!video.crossOrigin) video.crossOrigin = "anonymous";
  video.preservesPitch = false;
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
  const pitchParam = node.pitchSemitones;
  if (pitchParam) pitchParam.value = semitones;

  await ctx.resume().catch(() => {});

  return {
    ctx,
    node,
    source,
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
