import crypto from "crypto";

/**
 * Podcast Index API client.
 * Auth requires three headers:
 *   X-Auth-Date:   current unix time (seconds)
 *   X-Auth-Key:    the API key
 *   Authorization: sha1( key + secret + date )  (hex)
 * plus a User-Agent. Get any of these wrong and every call returns 401.
 */
const BASE = "https://api.podcastindex.org/api/1.0";

function authHeaders() {
  const key = process.env.PODCAST_INDEX_KEY;
  const secret = process.env.PODCAST_INDEX_SECRET;
  if (!key || !secret) {
    throw new Error("Missing PODCAST_INDEX_KEY / PODCAST_INDEX_SECRET.");
  }
  const date = Math.floor(Date.now() / 1000).toString();
  const hash = crypto
    .createHash("sha1")
    .update(key + secret + date)
    .digest("hex");
  return {
    "X-Auth-Date": date,
    "X-Auth-Key": key,
    Authorization: hash,
    "User-Agent": "PodProspect/1.0",
  };
}

export interface PIFeed {
  id: number;
  title: string;
  url: string; // feed url
  originalUrl?: string;
  link?: string; // website
  description?: string;
  author?: string;
  ownerName?: string;
  image?: string;
  artwork?: string;
  itunesId?: number | null;
  categories?: Record<string, string> | null;
  newestItemPublishTime?: number; // unix seconds
  episodeCount?: number;
}

/** Search feeds by term. Returns [] on any failure (logged). */
export async function searchByTerm(term: string, max = 40): Promise<PIFeed[]> {
  try {
    const url = `${BASE}/search/byterm?q=${encodeURIComponent(
      term
    )}&max=${max}&clean`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      console.error(`[podcastindex] ${res.status} for "${term}"`);
      return [];
    }
    const json = await res.json();
    return (json.feeds || []) as PIFeed[];
  } catch (e) {
    console.error("[podcastindex] error", e);
    return [];
  }
}

export function piCategories(cats?: Record<string, string> | null): string[] {
  if (!cats) return [];
  return Object.values(cats);
}
