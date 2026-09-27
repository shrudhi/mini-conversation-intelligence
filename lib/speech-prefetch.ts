import "server-only";

type PrefetchEntry = {
  promise: Promise<Uint8Array>;
  createdAt: number;
};

const cache = new Map<string, PrefetchEntry>();
const TTL_MS = 120_000;

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.createdAt > TTL_MS) cache.delete(key);
  }
}

export function speechPrefetchKey(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}`;
}

/** Start TTS while the client still paints the text reply — speech route reuses this promise. */
export function beginSpeechPrefetch(key: string, produce: () => Promise<Uint8Array>): void {
  prune();
  if (cache.has(key)) return;
  const promise = produce().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { promise, createdAt: Date.now() });
}

export function takeSpeechPrefetch(key: string): Promise<Uint8Array> | null {
  prune();
  const entry = cache.get(key);
  if (!entry) return null;
  cache.delete(key);
  return entry.promise;
}
