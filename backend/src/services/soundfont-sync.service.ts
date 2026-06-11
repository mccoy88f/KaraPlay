import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GM_INSTRUMENT_FILE_COUNT, GM_PATCH_TO_GLEITZ } from "../lib/gmPatchToGleitz.js";
import { getSoundfontBankById } from "../lib/soundfontBanks.js";
import { getStorageRoot } from "../lib/storage.js";

const GLEITZ_BASE = "https://gleitz.github.io/midi-js-soundfonts";
const CONCURRENCY = 6;

function soundfontDir(gleitzFolder: string): string {
  return path.join(getStorageRoot(), "soundfonts", gleitzFolder);
}

export function mp3JsFilename(instrumentBase: string): string {
  return `${instrumentBase}-mp3.js`;
}

export async function getSoundfontBankStatus(bankId: string): Promise<{
  bankId: string;
  gleitzFolder: string;
  total: number;
  present: number;
  ready: boolean;
}> {
  const bank = getSoundfontBankById(bankId);
  const dir = soundfontDir(bank.gleitzFolder);
  let present = 0;
  try {
    const names = await readdir(dir);
    const set = new Set(names);
    for (const inst of GM_PATCH_TO_GLEITZ) {
      if (set.has(mp3JsFilename(inst))) present += 1;
    }
  } catch {
    present = 0;
  }
  const total = GM_INSTRUMENT_FILE_COUNT;
  return {
    bankId: bank.id,
    gleitzFolder: bank.gleitzFolder,
    total,
    present,
    ready: present >= total,
  };
}

async function fetchToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function runPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

export async function syncSoundfontBank(bankId: string): Promise<{
  bankId: string;
  gleitzFolder: string;
  downloaded: number;
  skipped: number;
  errors: { file: string; message: string }[];
}> {
  const bank = getSoundfontBankById(bankId);
  const folder = bank.gleitzFolder;
  const dir = soundfontDir(folder);
  await mkdir(dir, { recursive: true });

  const errors: { file: string; message: string }[] = [];
  let downloaded = 0;
  let skipped = 0;

  const toFetch: string[] = [];
  for (const inst of GM_PATCH_TO_GLEITZ) {
    const fname = mp3JsFilename(inst);
    const dest = path.join(dir, fname);
    try {
      await access(dest);
      skipped += 1;
    } catch {
      toFetch.push(inst);
    }
  }

  await runPool(toFetch, CONCURRENCY, async (inst) => {
    const fname = mp3JsFilename(inst);
    const dest = path.join(dir, fname);
    const url = `${GLEITZ_BASE}/${folder}/${fname}`;
    try {
      await fetchToFile(url, dest);
      downloaded += 1;
    } catch (e) {
      errors.push({ file: fname, message: e instanceof Error ? e.message : String(e) });
    }
  });

  return {
    bankId: bank.id,
    gleitzFolder: folder,
    downloaded,
    skipped,
    errors,
  };
}
