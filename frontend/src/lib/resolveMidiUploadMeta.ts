import { extractMidiMeta } from "./midiMeta";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ResolvedMidiMeta = {
  title: string;
  artist: string;
  year: number | null;
  genre: string | null;
  coverUrl: string | null;
};

/** Titolo/artista dal file MIDI + genere/anno/copertina (e artista) da iTunes se richiesto. */
export async function resolveMidiUploadMeta(
  buf: ArrayBuffer,
  fileName: string,
  opts: {
    unknownArtist: string;
    useLookup: boolean;
    authHeader: () => Record<string, string>;
    base?: string;
  }
): Promise<ResolvedMidiMeta> {
  const base = opts.base ?? import.meta.env.VITE_API_URL ?? "";
  const meta = extractMidiMeta(buf, fileName);
  let title =
    meta.title ||
    fileName
      .replace(/\.(mid|midi|kar)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
  let artist = meta.artist || opts.unknownArtist;
  let year = meta.year;
  let genre: string | null = null;
  let coverUrl: string | null = null;

  if (opts.useLookup) {
    try {
      const qs = new URLSearchParams({ title });
      if (artist !== opts.unknownArtist) qs.set("artist", artist);
      qs.set("fileName", fileName);
      const r = await fetch(`${base}/api/admin/songs-meta-lookup?${qs}`, {
        headers: { ...opts.authHeader() },
      });
      if (r.ok) {
        const d = (await r.json()) as {
          genre?: string | null;
          year?: number | null;
          coverUrl?: string | null;
          foundArtist?: string | null;
        };
        genre = d.genre ?? null;
        if (!year && d.year) year = d.year;
        coverUrl = d.coverUrl ?? null;
        if ((!meta.artist || artist === opts.unknownArtist) && d.foundArtist?.trim()) {
          artist = d.foundArtist.trim();
        }
      }
      await sleep(350);
    } catch {
      /* lookup opzionale */
    }
  }

  return { title, artist, year, genre, coverUrl };
}
