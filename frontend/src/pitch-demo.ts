import { PitchShift, Player, getDestination, start as toneStart } from "tone";
import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import soundtouchProcessorUrl from "@soundtouchjs/audio-worklet/processor?url";

type Engine = "tone" | "soundtouch" | "dry";

const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const engineSelect = document.querySelector<HTMLSelectElement>("#engine")!;
const semitonesInput = document.querySelector<HTMLInputElement>("#semitones")!;
const semiLabel = document.querySelector<HTMLSpanElement>("#semiLabel")!;
const playBtn = document.querySelector<HTMLButtonElement>("#play")!;
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stop")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;

let blobUrl: string | null = null;
let fileName = "";

let tonePlayer: Player | null = null;
let tonePitch: PitchShift | null = null;

let stAudio: HTMLAudioElement | null = null;
let stCtx: AudioContext | null = null;
let stNode: SoundTouchNode | null = null;
let stElementSource: MediaElementAudioSourceNode | null = null;
let stRegisteredCtx: AudioContext | null = null;

function setStatus(msg: string) {
  statusEl.textContent = msg;
}

function semitones(): number {
  return Number(semitonesInput.value);
}

function updateSemiLabel() {
  const n = semitones();
  semiLabel.textContent = n === 0 ? "0 st (originale)" : n > 0 ? `+${n} st` : `${n} st`;
}

function setTransportEnabled(playing: boolean, hasFile: boolean) {
  playBtn.disabled = !hasFile || playing;
  pauseBtn.disabled = !hasFile || !playing;
  stopBtn.disabled = !hasFile;
}

async function disposeTone() {
  tonePlayer?.stop();
  tonePlayer?.dispose();
  tonePlayer = null;
  tonePitch?.dispose();
  tonePitch = null;
}

function disposeSoundTouch() {
  try {
    stAudio?.pause();
  } catch {
    /* ignore */
  }
  if (stAudio) {
    stAudio.src = "";
    stAudio.remove();
    stAudio = null;
  }
  stElementSource?.disconnect();
  stElementSource = null;
  stNode?.disconnect();
  stNode = null;
  void stCtx?.close().catch(() => {});
  stCtx = null;
}

async function disposeAll() {
  await disposeTone();
  disposeSoundTouch();
}

async function buildGraph(engine: Engine): Promise<void> {
  await disposeAll();
  if (!blobUrl) return;

  if (engine === "dry") {
    stAudio = document.createElement("audio");
    stAudio.src = blobUrl;
    stAudio.preservesPitch = true;
    stAudio.playbackRate = 1;
    stAudio.addEventListener("ended", onEnded);
    return;
  }

  if (engine === "tone") {
    await toneStart();
    tonePitch = new PitchShift({ pitch: semitones() });
    tonePlayer = new Player({ url: blobUrl, autostart: false });
    tonePlayer.connect(tonePitch);
    tonePitch.connect(getDestination());
    await tonePlayer.load(blobUrl);
    tonePlayer.onstop = onEnded;
    return;
  }

  stAudio = document.createElement("audio");
  stAudio.src = blobUrl;
  stAudio.preservesPitch = false;
  stAudio.playbackRate = 1;
  stAudio.loop = false;
  stAudio.addEventListener("ended", onEnded);

  stCtx = new AudioContext({ latencyHint: "playback" });
  if (stRegisteredCtx !== stCtx) {
    await SoundTouchNode.register(stCtx, soundtouchProcessorUrl);
    stRegisteredCtx = stCtx;
  }
  stNode = new SoundTouchNode({ context: stCtx });
  stNode.connect(stCtx.destination);
  stElementSource = stCtx.createMediaElementSource(stAudio);
  stElementSource.connect(stNode);
  stNode.playbackRate.value = 1;
  stNode.pitchSemitones.value = semitones();
}

function onEnded() {
  setTransportEnabled(false, Boolean(blobUrl));
  setStatus("Fine brano");
}

async function play() {
  if (!blobUrl) return;
  const engine = engineSelect.value as Engine;
  try {
    await buildGraph(engine);
    if (engine === "tone" && tonePlayer) {
      tonePitch!.pitch = semitones();
      tonePlayer.start();
    } else if (stAudio) {
      await stCtx?.resume();
      await stAudio.play();
    }
    setTransportEnabled(true, true);
    setStatus(`In riproduzione — ${engineLabel(engine)} · ${semiLabel.textContent}`);
  } catch (e) {
    setStatus(e instanceof Error ? e.message : "Errore avvio");
    setTransportEnabled(false, Boolean(blobUrl));
  }
}

async function pause() {
  const engine = engineSelect.value as Engine;
  if (engine === "tone") {
    tonePlayer?.stop();
  } else {
    stAudio?.pause();
  }
  setTransportEnabled(false, Boolean(blobUrl));
  setStatus("In pausa");
}

async function stopPlayback() {
  await disposeAll();
  setTransportEnabled(false, Boolean(blobUrl));
  setStatus("Fermato");
}

function engineLabel(engine: Engine): string {
  if (engine === "tone") return "Tone.js";
  if (engine === "soundtouch") return "SoundTouchJS";
  return "Originale";
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  void (async () => {
    await stopPlayback();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    fileName = "";
    if (!file) {
      playBtn.disabled = true;
      setStatus("");
      return;
    }
    blobUrl = URL.createObjectURL(file);
    fileName = file.name;
    playBtn.disabled = false;
    setStatus(`Caricato: ${fileName}`);
  })();
});

semitonesInput.addEventListener("input", () => {
  updateSemiLabel();
  const engine = engineSelect.value as Engine;
  if (engine === "tone" && tonePitch) tonePitch.pitch = semitones();
  if (engine === "soundtouch" && stNode) stNode.pitchSemitones.value = semitones();
  void stopPlayback();
});

engineSelect.addEventListener("change", () => void stopPlayback());

playBtn.addEventListener("click", () => void play());
pauseBtn.addEventListener("click", () => void pause());
stopBtn.addEventListener("click", () => void stopPlayback());

updateSemiLabel();
