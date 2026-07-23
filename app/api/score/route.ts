import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getOrSeedCampaign } from "@/lib/seed";
import { scorePodcast } from "@/lib/anthropic";
import { sleep } from "@/lib/utils";
import type { Podcast } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const campaign = await getOrSeedCampaign();
    const sb = getServiceClient();
    const body = await req.json().catch(() => ({}));
    // Small default batch so a scoring run stays under Netlify's function cap.
    const limit: number = body.limit ?? 10;

    // Active podcasts only. Never score dormant shows.
    const { data: pods, error } = await sb
      .from("podcasts")
      .select("*")
      .eq("active", true)
      .limit(500);
    if (error) throw error;

    // Which podcasts already have a match for this campaign?
    const { data: existing } = await sb
      .from("matches")
      .select("podcast_id")
      .eq("campaign_id", campaign.id);
    const scored = new Set((existing || []).map((m) => m.podcast_id));

    const todo = (pods || [])
      .filter((p) => !scored.has(p.id))
      .slice(0, limit) as Podcast[];

    const out: { title: string; score: number }[] = [];
    for (const pod of todo) {
      try {
        const { score, reasoning } = await scorePodcast(campaign, pod);
        await sb.from("matches").upsert(
          {
            campaign_id: campaign.id,
            podcast_id: pod.id,
            relevance_score: score,
            reasoning,
            status: "new",
          },
          { onConflict: "campaign_id,podcast_id", ignoreDuplicates: true }
        );
        out.push({ title: pod.title || pod.feed_url, score });
      } catch (e) {
        console.error(`[score] failed for ${pod.title}`, e);
      }
      await sleep(250);
    }

    out.sort((a, b) => b.score - a.score);
    return NextResponse.json({ scored: out.length, results: out });
  } catch (e: any) {
    console.error("[score] error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
