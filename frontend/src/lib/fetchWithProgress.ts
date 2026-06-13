/** Scarica un ArrayBuffer con percentuale (0–100) quando Content-Length è disponibile. */
export async function fetchArrayBufferWithProgress(
  url: string,
  onProgress?: (percent: number) => void
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download fallito (${res.status})`);
  }

  const total = Number(res.headers.get("Content-Length")) || 0;
  if (!res.body || total <= 0) {
    onProgress?.(50);
    const buf = await res.arrayBuffer();
    onProgress?.(100);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(Math.min(100, Math.round((received / total) * 100)));
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress?.(100);
  return out.buffer;
}
