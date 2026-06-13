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

export async function lookupItunesSong(
  title: string,
  artist: string
): Promise<ItunesLookupResult | null> {
  const term = encodeURIComponent(`${artist} ${title}`.trim());
  const r = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=1`, {
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
