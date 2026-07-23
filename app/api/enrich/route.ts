import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { parseFeed } from "@/lib/rss";
import { scrapeContactEmail } from "@/lib/firecrawl";
import { sleep } from "@/lib/utils";
import type { Podcast } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTIVE_WINDOW_DAYS = 120;

export async function POST(req: Request) {
  try {
    const sb = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const limit: number = body.limit ?? 25;

    // Only enrich podcasts not yet enriched.
    const { data: pods, error } = await sb
      .from("podcasts")
      .select("*")
      .is("enriched_at", null)
      .limit(limit);
    if (error) throw error;

    const results: { title: string; email: string | null; active: boolean }[] = [];
    const now = Date.now();

    for (const pod of (pods || []) as Podcast[]) {
      const parsed = await parseFeed(pod.feed_url);
      let ownerEmail = parsed?.ownerEmail ?? null;
      let ownerName = parsed?.ownerName ?? pod.owner_name ?? null;
      const website = parsed?.website ?? pod.website ?? null;
      const lastAt = parsed?.lastEpisodeAt ?? null;
      const active = lastAt
        ? now - lastAt.getTime() <= ACTIVE_WINDOW_DAYS * 86400000
        : false;

      let emailSource: "rss" | "scraped" | "manual" = "rss";
      let confidence = ownerEmail ? 0.8 : 0;
      let scrapedFrom: string | null = null;

      // Firecrawl fallback ONLY when RSS has no owner email (per-page cost).
      if (!ownerEmail && website) {
        const scraped = await scrapeContactEmail(website);
        if (scraped.email) {
          ownerEmail = scraped.email;
          emailSource = "scraped";
          confidence = 0.4;
          scrapedFrom = scraped.sourceUrl;
        }
      }

      const patch: Partial<Podcast> = {
        owner_email: ownerEmail,
        owner_name: ownerName,
        website,
        description: parsed?.description ?? pod.description,
        artwork_url: pod.artwork_url ?? parsed?.artwork ?? null,
        last_episode_at: lastAt ? lastAt.toISOString() : pod.last_episode_at,
        episode_count: parsed?.episodeCount ?? pod.episode_count,
        recent_episode_titles: parsed?.recentEpisodeTitles ?? [],
        categories:
          pod.categories?.length ? pod.categories : parsed?.categories ?? [],
        active,
        enriched_at: new Date().toISOString(),
      };

      await sb.from("podcasts").update(patch).eq("id", pod.id);

      if (ownerEmail) {
        // Upsert a contact record. Unique-ish per podcast+email.
        await sb.from("contacts").insert({
          podcast_id: pod.id,
          name: ownerName,
          email: ownerEmail,
          email_source: emailSource,
          confidence,
        });
      }

      results.push({ title: pod.title || pod.feed_url, email: ownerEmail, active });
      // gentle spacing so we don't hammer feed hosts / firecrawl
      await sleep(400);
    }

    const withEmail = results.filter((r) => r.email).length;
    return NextResponse.json({
      enriched: results.length,
      with_email: withEmail,
      active: results.filter((r) => r.active).length,
      results,
    });
  } catch (e: any) {
    console.error("[enrich] error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
