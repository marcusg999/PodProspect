import { sleep } from "./utils";

/**
 * iTunes Search API — secondary source. No auth, but it rate-limits hard
 * (~20 req/min). We keep a module-level timestamp gate so any caller is
 * throttled to a minimum spacing, and back off on 403.
 */
const MIN_SPACING_MS = 3200; // ~19/min
let lastCall = 0;

async function gate() {
  const now = Date.now();
  const wait = lastCall + MIN_SPACING_MS - now;
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

export interface ITunesResult {
  collectionId: number;
  trackId?: number;
  collectionName: string;
  feedUrl?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  genres?: string[];
  releaseDate?: string;
}

export async function searchITunes(
  term: string,
  limit = 25
): Promise<ITunesResult[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    term
  )}&media=podcast&limit=${limit}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    await gate();
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "PodProspect/1.0" },
      });
      if (res.status === 403 || res.status === 429) {
        const backoff = 2000 * Math.pow(2, attempt);
        console.warn(`[itunes] ${res.status}, backing off ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) {
        console.error(`[itunes] ${res.status} for "${term}"`);
        return [];
      }
      const json = await res.json();
      return (json.results || []) as ITunesResult[];
    } catch (e) {
      console.error("[itunes] error", e);
      await sleep(1500 * (attempt + 1));
    }
  }
  return [];
}

/** Look up a single podcast by iTunes collection id (for feedUrl resolution). */
export async function lookupITunes(id: number): Promise<ITunesResult | null> {
  await gate();
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`, {
      headers: { "User-Agent": "PodProspect/1.0" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.results?.[0] as ITunesResult) || null;
  } catch {
    return null;
  }
}
