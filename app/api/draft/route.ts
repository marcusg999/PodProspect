import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getOrSeedCampaign } from "@/lib/seed";
import { draftPitch } from "@/lib/anthropic";
import type { MatchRow, Podcast } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/draft { matchId }  OR  { all: true }
 * Generates a Sonnet pitch for shortlisted match(es), stores outreach,
 * and sets status='drafted'. Never auto-approves.
 */
export async function POST(req: Request) {
  try {
    const campaign = await getOrSeedCampaign();
    const sb = getServiceClient();
    const body = await req.json().catch(() => ({}));

    let q = sb
      .from("matches")
      .select("*, podcast:podcasts(*)")
      .eq("campaign_id", campaign.id)
      .eq("status", "shortlisted");
    if (body.matchId) q = q.eq("id", body.matchId);

    const { data: matches, error } = await q;
    if (error) throw error;

    const out: { match_id: string; title: string; detail: string }[] = [];
    for (const m of (matches || []) as (MatchRow & { podcast: Podcast })[]) {
      try {
        const draft = await draftPitch(campaign, m.podcast);
        await sb.from("outreach").upsert(
          {
            match_id: m.id,
            subject: draft.subject,
            body: draft.body,
            icebreaker: draft.icebreaker,
            detail_cited: draft.detail_cited,
            viewed_at: null,
          },
          { onConflict: "match_id" }
        );
        await sb.from("matches").update({ status: "drafted" }).eq("id", m.id);
        out.push({
          match_id: m.id,
          title: m.podcast.title || m.podcast.feed_url,
          detail: draft.detail_cited,
        });
      } catch (e: any) {
        console.error(`[draft] failed for ${m.podcast?.title}`, e);
      }
    }

    return NextResponse.json({ drafted: out.length, results: out });
  } catch (e: any) {
    console.error("[draft] error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
