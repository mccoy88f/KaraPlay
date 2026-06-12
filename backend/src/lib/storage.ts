import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export function getStorageRoot(): string {
  return process.env.STORAGE_PATH ?? path.join(process.cwd(), "storage");
}

export function getCookiesDir(): string {
  return path.join(getStorageRoot(), "cookies");
}

/** File legacy condiviso (formato Netscape), usato come ripiego. */
export function getDefaultYoutubeCookiesPath(): string {
  return path.join(getCookiesDir(), "youtube.txt");
}

/** Ogni admin/super admin ha il proprio file cookies. */
export function getAdminCookiesPath(adminId: string): string {
  return path.join(getCookiesDir(), `admin-${adminId}.txt`);
}

/**
 * Priorità: cookies personali dell'admin della serata → YOUTUBE_COOKIES_PATH (env)
 * → file condiviso legacy.
 */
export function resolveYoutubeCookiesPath(adminId?: string | null): string | null {
  if (adminId) {
    const own = getAdminCookiesPath(adminId);
    if (existsSync(own)) {
      return own;
    }
  }
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
