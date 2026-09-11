import { XMLParser } from "fast-xml-parser";
import { extractEmail } from "./utils";

export interface ParsedFeed {
  ownerEmail: string | null;
  ownerName: string | null;
  website: string | null;
  description: string | null;
  artwork: string | null;
  lastEpisodeAt: Date | null;
  episodeCount: number;
  recentEpisodeTitles: string[];
  categories: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  textNodeName: "#text",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Read a text-ish node that may be a string or {#text} object. */
function txt(node: any): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "object" && node["#text"]) return String(node["#text"]).trim() || null;
  return null;
}

/** Fetch and parse an RSS feed for owner email, website, episode recency, etc. */
export async function parseFeed(feedUrl: string): Promise<ParsedFeed | null> {
  let xml: string;
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "PodProspect/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[rss] ${res.status} for ${feedUrl}`);
      return null;
    }
    xml = await res.text();
  } catch (e) {
    console.warn(`[rss] fetch failed ${feedUrl}`, e);
    return null;
  }

  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    console.warn(`[rss] parse failed ${feedUrl}`, e);
    return null;
  }

  const channel = doc?.rss?.channel || doc?.["rss"]?.["channel"] || doc?.feed;
  if (!channel) return null;

  // itunes:owner email — the primary target. Often missing in this niche.
  const owner = channel["itunes:owner"];
  let ownerEmail: string | null = null;
  let ownerName: string | null = null;
  if (owner) {
    ownerEmail = txt(owner["itunes:email"]) || null;
    ownerName = txt(owner["itunes:name"]) || null;
  }
  // Fallbacks for email: managingEditor, webMaster, <itunes:email> at channel.
  if (!ownerEmail) {
    ownerEmail =
      extractEmail(txt(channel["itunes:email"])) ||
      extractEmail(txt(channel["managingEditor"])) ||
      extractEmail(txt(channel["webMaster"])) ||
      null;
  }
  ownerEmail = ownerEmail ? ownerEmail.toLowerCase() : null;

  const website = txt(channel.link) || null;
  const description =
    txt(channel.description) || txt(channel["itunes:summary"]) || null;
  const artwork =
    channel["itunes:image"]?.["@_href"] ||
    txt(channel["image"]?.url) ||
    null;

  // Categories
  const cats: string[] = [];
  for (const c of asArray(channel["itunes:category"])) {
    const name = (c as any)?.["@_text"];
    if (name) cats.push(String(name));
    for (const sub of asArray((c as any)?.["itunes:category"])) {
      const s = (sub as any)?.["@_text"];
      if (s) cats.push(String(s));
    }
  }

  // Episodes
  const items = asArray(channel.item);
  const dates: Date[] = [];
  const titles: string[] = [];
  for (const it of items) {
    const t = txt((it as any).title);
    if (t) titles.push(t);
    const pd = txt((it as any).pubDate);
    if (pd) {
      const d = new Date(pd);
      if (!isNaN(d.getTime())) dates.push(d);
    }
  }
  dates.sort((a, b) => b.getTime() - a.getTime());

  return {
    ownerEmail,
    ownerName,
    website,
    description,
    artwork,
    lastEpisodeAt: dates[0] || null,
    episodeCount: items.length,
    recentEpisodeTitles: titles.slice(0, 5),
    categories: Array.from(new Set(cats)),
  };
}
