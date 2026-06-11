const BASE = "https://lrclib.net/api";

export type LrcResult = {
  syncedLyrics: string | null;
  plainLyrics: string | null;
};

export async function fetchLrcFromLrclib(
  title: string,
  artist: string,
  durationSec?: number
): Promise<LrcResult | null> {
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
  });
  if (durationSec !== undefined && Number.isFinite(durationSec)) {
    params.set("duration", String(Math.round(durationSec)));
  }

  const res = await fetch(`${BASE}/get?${params.toString()}`);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    syncedLyrics?: string | null;
    plainLyrics?: string | null;
  };
  return {
    syncedLyrics: data.syncedLyrics ?? null,
    plainLyrics: data.plainLyrics ?? null,
  };
}
