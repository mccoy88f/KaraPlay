import { access } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { ensureStorageLayout, getStorageRoot } from "../lib/storage.js";
import { downloadVideoMp4, previewUrl } from "./ytdlp.service.js";
import { getIo } from "../socket/io.js";
import { emitQueueUpdate } from "../socket/emit.js";

export type YoutubeJobStatus = {
  phase: "idle" | "downloading" | "done" | "error";
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

/**
 * Pre-download opzionale del VIDEO (mp4): il display lo riproduce dal server senza
 * pubblicità. Se non eseguito, il display ripiega sull'embed YouTube.
 */
export async function startYoutubeProcess(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });
  if (!booking) {
    throw new Error("Prenotazione non trovata");
  }
  if (!booking.ytUrl) {
    throw new Error("URL YouTube mancante");
  }
  if (booking.status !== "APPROVED") {
    throw new Error("Lo stato deve essere APPROVED (prima approva la richiesta)");
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
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking?.ytUrl) return;

  const eventId = booking.eventId;
  const basePath = path.join(getStorageRoot(), "yt", bookingId);

  try {
    await ensureStorageLayout();

    const meta = await previewUrl(booking.ytUrl);

    const filePath = await downloadVideoMp4(booking.ytUrl, basePath, (p) => {
      const rounded = Math.min(99, Math.round(p.percent ?? 0));
      jobMap.set(bookingId, { phase: "downloading", progress: rounded });
      emitProcessing(eventId, bookingId, rounded);
    });

    await access(filePath);

    const title = booking.ytTitle?.trim() || meta.title;

    const song = await prisma.song.create({
      data: {
        title,
        artist: meta.artist,
        source: "YOUTUBE",
        // Campo storico: per i brani YouTube contiene il percorso del video mp4.
        mp3Path: `yt/${bookingId}.mp4`,
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
