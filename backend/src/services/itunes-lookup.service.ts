export type ItunesLookupResult = {
  genre: string | null;
  year: number | null;
  foundTitle: string | null;
  foundArtist: string | null;
  coverUrl: string | null;
};

/** Copertina iTunes più grande (100×100 → 600×600). */
export function upscaleItunesArtwork(url: string, size = 600): string {
  return url.replace(/\d+x\d+bb\./i, `${size}x${size}bb.`);
}

function clean(s: string): string {
  return s
    .replace(/^["'«\s]+|["'»\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeFileSegment(s: string): string {
  return clean(s.replace(/_/g, " ").replace(/-/g, " "));
}

/** Nome file tipico karaoke: `Artista--Titolo.mid` o `Artista - Titolo.mid`. */
export function parseFileNameMeta(fileName: string): { title: string; artist: string } {
  const stem = fileName.replace(/\.(mid|midi|kar)$/i, "");
  const double = /^(.+?)--(.+)$/.exec(stem);
  if (double) {
    return {
      artist: humanizeFileSegment(double[1]),
      title: humanizeFileSegment(double[2]),
    };
  }
  const spaced = stem.replace(/_+/g, " ");
  const single = /^(.{2,50}?)\s[-–]\s(.{2,80})$/.exec(spaced);
  if (single) {
    return { artist: clean(single[1]), title: clean(single[2]) };
  }
  return { title: humanizeFileSegment(stem), artist: "" };
}

async function searchItunes(term: string): Promise<ItunesLookupResult | null> {
  const q = encodeURIComponent(term.trim());
  if (!q) return null;
  const r = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`, {
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as {
    results?: {
      primaryGenreName?: string;
      releaseDate?: string;
      trackName?: string;
      artistName?: string;
      artworkUrl100?: string;
      artworkUrl60?: string;
    }[];
  };
  const hit = j.results?.[0];
  if (!hit) return null;
  const year = hit.releaseDate ? Number.parseInt(hit.releaseDate.slice(0, 4), 10) : null;
  const rawArt = hit.artworkUrl100 ?? hit.artworkUrl60 ?? null;
  return {
    genre: hit.primaryGenreName ?? null,
    year: Number.isInteger(year) ? year : null,
    foundTitle: hit.trackName ?? null,
    foundArtist: hit.artistName ?? null,
    coverUrl: rawArt ? upscaleItunesArtwork(rawArt) : null,
  };
}

/** Prova più query in ordine: artista+titolo, solo titolo, nome file `Artista--Titolo`. */
export async function lookupItunesMidiMeta(opts: {
  title: string;
  artist?: string;
  fileName?: string;
}): Promise<ItunesLookupResult | null> {
  const title = opts.title.trim();
  const artist = opts.artist?.trim() ?? "";
  const fromFile = opts.fileName ? parseFileNameMeta(opts.fileName) : { title: "", artist: "" };

  const terms: string[] = [];
  if (artist && title) terms.push(`${artist} ${title}`);
  if (title) terms.push(title);
  if (fromFile.artist && fromFile.title) terms.push(`${fromFile.artist} ${fromFile.title}`);
  if (fromFile.title && fromFile.title !== title) terms.push(fromFile.title);
  if (fromFile.artist && title && !artist) terms.push(`${fromFile.artist} ${title}`);

  const seen = new Set<string>();
  for (const term of terms) {
    const key = term.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const hit = await searchItunes(term);
    if (hit) return hit;
  }
  return null;
}

export async function lookupItunesSong(
  title: string,
  artist: string
): Promise<ItunesLookupResult | null> {
  return lookupItunesMidiMeta({ title, artist });
}
