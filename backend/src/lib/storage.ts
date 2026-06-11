import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export function getStorageRoot(): string {
  return process.env.STORAGE_PATH ?? path.join(process.cwd(), "storage");
}

export function getCookiesDir(): string {
  return path.join(getStorageRoot(), "cookies");
}

/** File caricato dall'admin (formato Netscape) */
export function getDefaultYoutubeCookiesPath(): string {
  return path.join(getCookiesDir(), "youtube.txt");
}

/**
 * Priorità: YOUTUBE_COOKIES_PATH (env) se il file esiste, altrimenti file admin sotto storage.
 */
export function resolveYoutubeCookiesPath(): string | null {
  const fromEnv = process.env.YOUTUBE_COOKIES_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  const def = getDefaultYoutubeCookiesPath();
  if (existsSync(def)) {
    return def;
  }
  return null;
}

/** Cartella dei file SoundFont (.sf2/.sf3) caricati dall'admin. */
export function getSf2Dir(): string {
  return path.join(getStorageRoot(), "soundfonts", "sf2");
}

export async function ensureStorageLayout(): Promise<void> {
  const root = getStorageRoot();
  await mkdir(path.join(root, "yt"), { recursive: true });
  await mkdir(path.join(root, "lrc"), { recursive: true });
  await mkdir(path.join(root, "cookies"), { recursive: true });
  await mkdir(path.join(root, "midi"), { recursive: true });
  await mkdir(path.join(root, "soundfonts"), { recursive: true });
  await mkdir(getSf2Dir(), { recursive: true });
}
