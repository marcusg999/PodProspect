import { extractEmail } from "./utils";

/**
 * Firecrawl fallback — only called when the RSS feed has NO owner email.
 * Firecrawl bills per page, so callers must gate this on a missing email and
 * cache the result (email_source='scraped', lower confidence).
 */
export interface ScrapeResult {
  email: string | null;
  sourceUrl: string | null;
}

async function scrapePage(url: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn(`[firecrawl] ${res.status} for ${url}`);
      return null;
    }
    const json = await res.json();
    return json?.data?.markdown || json?.markdown || null;
  } catch (e) {
    console.warn(`[firecrawl] error ${url}`, e);
    return null;
  }
}

/**
 * Try the website's /contact then /about, then the homepage, for the best
 * email. Stops at the first hit to minimise billed pages.
 */
export async function scrapeContactEmail(
  website: string
): Promise<ScrapeResult> {
  let base: URL;
  try {
    base = new URL(website);
  } catch {
    return { email: null, sourceUrl: null };
  }
  const candidates = [
    new URL("/contact", base).toString(),
    new URL("/about", base).toString(),
    base.toString(),
  ];
  for (const url of candidates) {
    const md = await scrapePage(url);
    const email = extractEmail(md);
    if (email) return { email, sourceUrl: url };
  }
  return { email: null, sourceUrl: null };
}
