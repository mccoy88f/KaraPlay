import { spawn } from "node:child_process";
import path from "node:path";
import { resolveYoutubeCookiesPath } from "../lib/storage.js";

export type VideoMeta = {
  title: string;
  duration: number | null;
  artist: string;
  id: string;
};

function cookiesArgs(): string[] {
  const p = resolveYoutubeCookiesPath();
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
export async function previewUrl(url: string): Promise<VideoMeta> {
  const args = [
    "--dump-single-json",
    "--no-download",
    "--skip-download",
    "--no-warnings",
    "--no-playlist",
    ...cookiesArgs(),
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

export type DownloadProgress = { percent: number | null; line: string };

/**
 * Scarica solo audio in opus sotto outputPath (senza estensione: yt-dlp aggiunge .opus).
 */
export async function downloadAudioOpus(
  url: string,
  outputBasePathWithoutExt: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<string> {
  const args = [
    "--extract-audio",
    "--audio-format",
    "opus",
    "--audio-quality",
    "0",
    "--no-playlist",
    "--no-warnings",
    "--newline",
    "--progress",
    "-o",
    `${outputBasePathWithoutExt}.%(ext)s`,
    ...cookiesArgs(),
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
      const finalPath = `${outputBasePathWithoutExt}.opus`;
      resolve(path.normalize(finalPath));
    });
  });
}
