import { spawn } from "node:child_process";
import path from "node:path";
import { resolveYoutubeCookiesPath } from "../lib/storage.js";

export type VideoMeta = {
  title: string;
  duration: number | null;
  artist: string;
  id: string;
};

function cookiesArgs(adminId?: string | null): string[] {
  const p = resolveYoutubeCookiesPath(adminId);
  if (!p) return [];
  return ["--cookies", p];
}

function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ stdout, stderr, code }));
  });
}

/**
 * Metadati senza scaricare audio (utile per preview e admin).
 */
export async function previewUrl(url: string, cookiesAdminId?: string | null): Promise<VideoMeta> {
  const args = [
    "--dump-single-json",
    "--no-download",
    "--skip-download",
    "--no-warnings",
    "--no-playlist",
    ...cookiesArgs(cookiesAdminId),
    url,
  ];
  const { stdout, stderr, code } = await runYtDlp(args);
  if (code !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `yt-dlp terminato con codice ${code}`);
  }
  const line = stdout.trim().split("\n").filter(Boolean).pop();
  if (!line) {
    throw new Error("Nessun output JSON da yt-dlp");
  }
  const j = JSON.parse(line) as {
    id?: string;
    title?: string;
    duration?: number;
    artist?: string;
    track?: string;
    uploader?: string;
  };
  const title = j.title ?? "Senza titolo";
  const artist =
    (typeof j.artist === "string" && j.artist.trim()) ||
    (typeof j.track === "string" && j.track !== title ? j.track : undefined) ||
    (typeof j.uploader === "string" ? j.uploader : "Sconosciuto");
  return {
    id: j.id ?? "",
    title,
    duration: typeof j.duration === "number" ? Math.round(j.duration) : null,
    artist: artist ?? "Sconosciuto",
  };
}

export type YoutubeSearchResult = {
  id: string;
  url: string;
  title: string;
  channel: string;
  duration: number | null;
  thumbnail: string | null;
};

/**
 * Ricerca su YouTube (yt-dlp ytsearch). --flat-playlist evita di risolvere ogni video: veloce,
 * ma la durata può mancare per alcuni risultati.
 */
export async function searchYoutube(
  query: string,
  limit = 8,
  offset = 0,
  cookiesAdminId?: string | null
): Promise<{ results: YoutubeSearchResult[]; hasMore: boolean }> {
  const lim = Math.min(Math.max(Math.trunc(limit), 1), 15);
  const off = Math.max(Math.trunc(offset), 0);
  const maxFetch = 50;
  const fetchCount = Math.min(off + lim, maxFetch);
  const args = [
    "--dump-json",
    "--flat-playlist",
    "--no-warnings",
    ...cookiesArgs(cookiesAdminId),
    `ytsearch${fetchCount}:${query}`,
  ];
  const { stdout, stderr, code } = await runYtDlp(args);
  if (code !== 0) {
    throw new Error(stderr.trim() || `yt-dlp search fallita (codice ${code})`);
  }
  const all: YoutubeSearchResult[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let j: {
      id?: string;
      title?: string;
      url?: string;
      duration?: number | null;
      channel?: string;
      uploader?: string;
      thumbnails?: { url?: string }[];
    };
    try {
      j = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!j.id) continue;
    all.push({
      id: j.id,
      url: j.url ?? `https://www.youtube.com/watch?v=${j.id}`,
      title: j.title ?? "Senza titolo",
      channel: j.channel ?? j.uploader ?? "",
      duration: typeof j.duration === "number" ? Math.round(j.duration) : null,
      thumbnail: j.thumbnails?.[0]?.url ?? `https://i.ytimg.com/vi/${j.id}/mqdefault.jpg`,
    });
  }
  const page = all.slice(off, off + lim);
  const hasMore = all.length >= off + lim && off + lim < maxFetch && all.length === fetchCount;
  return { results: page, hasMore };
}

export type DownloadProgress = { percent: number | null; line: string };

/**
 * Scarica il video alla massima qualità disponibile (bestvideo+bestaudio, merge in mp4)
 * sotto outputPath, senza estensione: il file finale è `${outputBasePathWithoutExt}.mp4`.
 * Riprodotto dal server al posto dell'embed YouTube per evitare la pubblicità.
 * Richiede ffmpeg per il merge.
 */
export async function downloadVideoMp4(
  url: string,
  outputBasePathWithoutExt: string,
  onProgress?: (p: DownloadProgress) => void,
  cookiesAdminId?: string | null
): Promise<string> {
  const args = [
    "-f",
    "bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "--no-playlist",
    "--no-warnings",
    "--newline",
    "--progress",
    "-o",
    `${outputBasePathWithoutExt}.%(ext)s`,
    ...cookiesArgs(cookiesAdminId),
    url,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const onChunk = (d: Buffer) => {
      const text = d.toString();
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const m = /(\d+\.?\d*)%/.exec(line);
        onProgress?.({
          percent: m ? Number.parseFloat(m[1]) : null,
          line,
        });
      }
    };
    proc.stdout.on("data", onChunk);
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      onChunk(d);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp download fallito (${code})`));
        return;
      }
      resolve(path.normalize(`${outputBasePathWithoutExt}.mp4`));
    });
  });
}
