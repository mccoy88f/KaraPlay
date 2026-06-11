import { access } from "node:fs/promises";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { prisma } from "../lib/prisma.js";
import { ensureStorageLayout, getStorageRoot } from "../lib/storage.js";
import { downloadAudioOpus, previewUrl } from "./ytdlp.service.js";
import { fetchLrcFromLrclib } from "./lrclib.service.js";
import { getIo } from "../socket/io.js";
import { emitQueueUpdate } from "../socket/emit.js";

export type YoutubeJobStatus = {
  phase: "idle" | "downloading" | "post" | "done" | "error";
  progress: number;
  error?: string;
};

const jobMap = new Map<string, YoutubeJobStatus>();

export function getYoutubeJobStatus(bookingId: string): YoutubeJobStatus | undefined {
  return jobMap.get(bookingId);
}

function emitProcessing(eventId: string, bookingId: string, progress: number) {
  getIo()?.to(`event:${eventId}`).emit("youtube:processing", { bookingId, progress });
}

export async function startYoutubeProcess(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { event: true },
  });
  if (!booking) {
    throw new Error("Prenotazione non trovata");
  }
  if (!booking.ytUrl) {
    throw new Error("URL YouTube mancante");
  }
  if (booking.status !== "APPROVED") {
    throw new Error('Lo stato deve essere APPROVED (prima approva la richiesta)');
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "PROCESSING", ytProcessError: null },
  });
  await emitQueueUpdate(booking.eventId);

  jobMap.set(bookingId, { phase: "downloading", progress: 0 });
  emitProcessing(booking.eventId, bookingId, 0);

  void runJob(bookingId).catch((err) => {
    console.error("[youtube-process]", err);
  });
}

async function runJob(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { event: true },
  });
  if (!booking?.ytUrl) return;

  const eventId = booking.eventId;
  const root = getStorageRoot();
  const ytDir = path.join(root, "yt");
  const basePath = path.join(ytDir, bookingId);

  try {
    await ensureStorageLayout();

    const meta = await previewUrl(booking.ytUrl);

    const filePath = await downloadAudioOpus(booking.ytUrl, basePath, (p) => {
      const pct = p.percent ?? 0;
      const rounded = Math.min(95, Math.round(pct));
      jobMap.set(bookingId, { phase: "downloading", progress: rounded });
      emitProcessing(eventId, bookingId, rounded);
    });

    await access(filePath);

    jobMap.set(bookingId, { phase: "post", progress: 96 });
    emitProcessing(eventId, bookingId, 96);

    const title = booking.ytTitle?.trim() || meta.title;
    const artist = meta.artist;

    const lrc = await fetchLrcFromLrclib(title, artist, meta.duration ?? undefined);
    let lrcRelative: string | null = null;
    let ytLrcFound = false;
    const text = lrc?.syncedLyrics ?? lrc?.plainLyrics;
    if (text) {
      lrcRelative = `lrc/${bookingId}.lrc`;
      await writeFile(path.join(root, lrcRelative), text, "utf8");
      ytLrcFound = true;
    }

    const relAudio = `yt/${bookingId}.opus`;

    const song = await prisma.song.create({
      data: {
        title,
        artist,
        source: "YOUTUBE",
        mp3Path: relAudio,
        lrcPath: lrcRelative,
        duration: meta.duration,
        tags: ["youtube"],
      },
    });

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        songId: song.id,
        status: "READY",
        ytTitle: title,
        ytLrcFound,
        ytProcessError: null,
      },
    });

    jobMap.set(bookingId, { phase: "done", progress: 100 });
    emitProcessing(eventId, bookingId, 100);
    getIo()?.to(`event:${eventId}`).emit("youtube:ready", { bookingId });
    await emitQueueUpdate(eventId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "APPROVED",
        ytProcessError: msg,
      },
    });
    jobMap.set(bookingId, { phase: "error", progress: 0, error: msg });
    getIo()?.to(`event:${eventId}`).emit("youtube:error", { bookingId, error: msg });
    await emitQueueUpdate(eventId);
  }
}
