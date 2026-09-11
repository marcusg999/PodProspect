import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getOrSeedCampaign } from "@/lib/seed";
import { searchByTerm, piCategories } from "@/lib/podcastindex";
import { searchITunes } from "@/lib/itunes";
import { canonicalFeedUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface NormalizedPodcast {
  source: string;
  source_id: string | null;
  title: string | null;
  description: string | null;
  feed_url: string;
  website: string | null;
  categories: string[];
  owner_name: string | null;
  itunes_id: string | null;
  artwork_url: string | null;
  last_episode_at: string | null;
  episode_count: number | null;
}

export async function POST(req: Request) {
  try {
    const campaign = await getOrSeedCampaign();
    const sb = getServiceClient();

    const body = await req.json().catch(() => ({}));
    const keywords: string[] =
      Array.isArray(body.keywords) && body.keywords.length
        ? body.keywords
        : campaign.target_keywords;

    // Dedupe map keyed on canonical feed_url.
    const byFeed = new Map<string, NormalizedPodcast>();
    const runs: { keyword: string; count: number }[] = [];

    for (const kw of keywords) {
      let found = 0;

      // Podcast Index (primary)
      for (const f of await searchByTerm(kw)) {
        const feed = canonicalFeedUrl(f.url);
        if (!feed) continue;
        found++;
        byFeed.set(feed, {
          source: "podcastindex",
          source_id: String(f.id),
          title: f.title || null,
          description: f.description || null,
          feed_url: feed,
          website: f.link || null,
          categories: piCategories(f.categories),
          owner_name: f.ownerName || f.author || null,
          itunes_id: f.itunesId ? String(f.itunesId) : null,
          artwork_url: f.artwork || f.image || null,
          last_episode_at: f.newestItemPublishTime
            ? new Date(f.newestItemPublishTime * 1000).toISOString()
            : null,
          episode_count: f.episodeCount ?? null,
        });
      }

      // iTunes (secondary) — fills feeds PI missed. Throttled inside the lib.
      for (const r of await searchITunes(kw)) {
        const feed = canonicalFeedUrl(r.feedUrl);
        if (!feed) continue;
        found++;
        if (byFeed.has(feed)) {
          // enrich itunes_id/artwork on the PI record if missing
          const existing = byFeed.get(feed)!;
          if (!existing.itunes_id) existing.itunes_id = String(r.collectionId);
          if (!existing.artwork_url)
            existing.artwork_url = r.artworkUrl600 || r.artworkUrl100 || null;
          continue;
        }
        byFeed.set(feed, {
          source: "itunes",
          source_id: String(r.collectionId),
          title: r.collectionName || null,
          description: null,
          feed_url: feed,
          website: r.trackViewUrl || null,
          categories: r.genres || [],
          owner_name: r.artistName || null,
          itunes_id: String(r.collectionId),
          artwork_url: r.artworkUrl600 || r.artworkUrl100 || null,
          last_episode_at: r.releaseDate || null,
          episode_count: null,
        });
      }

      runs.push({ keyword: kw, count: found });
      await sb.from("search_runs").insert({
        campaign_id: campaign.id,
        keyword: kw,
        results_count: found,
      });
    }

    // Upsert deduped podcasts by feed_url. onConflict keeps existing rows,
    // updates coarse metadata but never clobbers enrichment (owner_email etc.).
    const rows = Array.from(byFeed.values());
    let upserted = 0;
    if (rows.length) {
      const { data, error } = await sb
        .from("podcasts")
        .upsert(rows, { onConflict: "feed_url", ignoreDuplicates: false })
        .select("id");
      if (error) throw error;
      upserted = data?.length ?? 0;
    }

    return NextResponse.json({
      keywords: keywords.length,
      unique_feeds: rows.length,
      upserted,
      runs,
    });
  } catch (e: any) {
    console.error("[search] error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
