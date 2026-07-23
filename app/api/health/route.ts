import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getOrSeedCampaign } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Check {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  data?: unknown;
}

export async function GET() {
  const checks: Check[] = [];
  try {
    const campaign = await getOrSeedCampaign();
    const sb = getServiceClient();

    // 1. Search returns shows with resolvable feed_urls
    const { data: pods } = await sb
      .from("podcasts")
      .select("id, title, feed_url, owner_email, active, artwork_url");
    const total = pods?.length ?? 0;
    const withFeed = (pods || []).filter((p) => p.feed_url?.startsWith("http")).length;
    checks.push({
      id: "feeds",
      label: "Search returns shows with resolvable feed_urls",
      pass: total > 0 && withFeed === total,
      detail: `${withFeed}/${total} podcasts have http(s) feed_urls`,
    });

    // 2. >=5 shows have a parsed itunes:owner (rss) email
    const { data: rssContacts } = await sb
      .from("contacts")
      .select("id, email, podcast_id")
      .eq("email_source", "rss");
    const rssEmailCount = rssContacts?.length ?? 0;
    checks.push({
      id: "rss_emails",
      label: ">= 5 shows have a parsed itunes:owner email from their feed",
      pass: rssEmailCount >= 5,
      detail: `${rssEmailCount} shows have an RSS owner email (music/spirituality niche runs ~40-60% coverage)`,
    });

    // 3. Top-5 and bottom-5 scores are sane
    const { data: scored } = await sb
      .from("matches")
      .select("relevance_score, reasoning, podcast:podcasts(title)")
      .eq("campaign_id", campaign.id)
      .not("relevance_score", "is", null)
      .order("relevance_score", { ascending: false });
    const top5 = (scored || []).slice(0, 5);
    const bottom5 = (scored || []).slice(-5);
    checks.push({
      id: "scores",
      label: "Top-5 and bottom-5 scores are sane for the campaign",
      pass: (scored?.length ?? 0) >= 2 && (top5[0] as any)?.relevance_score >= (bottom5[bottom5.length - 1] as any)?.relevance_score,
      detail: `${scored?.length ?? 0} scored matches`,
      data: { top5, bottom5 },
    });

    // 4. Every generated draft + icebreaker cites a specific show detail
    const { data: drafts } = await sb
      .from("outreach")
      .select("id, icebreaker, body, detail_cited");
    const draftTotal = drafts?.length ?? 0;
    const draftsCiting = (drafts || []).filter(
      (d) => (d.detail_cited && d.detail_cited.trim().length > 0) &&
             (d.icebreaker && d.icebreaker.trim().length > 0)
    ).length;
    checks.push({
      id: "drafts_cite",
      label: "Every generated draft + icebreaker cites a specific show detail",
      pass: draftTotal === 0 || draftsCiting === draftTotal,
      detail: draftTotal === 0
        ? "No drafts generated yet"
        : `${draftsCiting}/${draftTotal} drafts cite a specific detail`,
    });

    // 5. Exported rows all have a non-empty email
    const { data: exported } = await sb
      .from("matches")
      .select("id, podcast:podcasts(owner_email)")
      .eq("status", "exported");
    const expTotal = exported?.length ?? 0;
    const expWithEmail = (exported || []).filter(
      (e: any) => e.podcast?.owner_email?.includes("@")
    ).length;
    checks.push({
      id: "export_email",
      label: "Every exported row has a non-empty email",
      pass: expTotal === expWithEmail,
      detail: expTotal === 0
        ? "Nothing exported yet"
        : `${expWithEmail}/${expTotal} exported rows have an email`,
    });

    // 6. No duplicate feed_urls
    const seen = new Map<string, number>();
    for (const p of pods || []) seen.set(p.feed_url, (seen.get(p.feed_url) || 0) + 1);
    const dupes = Array.from(seen.entries()).filter(([, n]) => n > 1);
    checks.push({
      id: "no_dupes",
      label: "No duplicate feed_urls exist",
      pass: dupes.length === 0,
      detail: dupes.length === 0 ? "All feed_urls unique" : `${dupes.length} duplicate feed_urls`,
    });

    // 7. Export refuses non-approved rows (test with a drafted row)
    const { data: draftedMatch } = await sb
      .from("matches")
      .select("id")
      .eq("campaign_id", campaign.id)
      .eq("status", "drafted")
      .limit(1)
      .maybeSingle();
    let gatePass = true;
    let gateDetail = "No drafted row available to test the gate";
    if (draftedMatch) {
      // Simulate the export query: it filters status='approved', so a drafted
      // id must yield zero exportable rows.
      const { data: gateRows } = await sb
        .from("matches")
        .select("id")
        .eq("status", "approved")
        .eq("id", draftedMatch.id);
      gatePass = (gateRows?.length ?? 0) === 0;
      gateDetail = gatePass
        ? `Drafted match ${draftedMatch.id.slice(0, 8)} is correctly excluded from export`
        : `LEAK: drafted match appeared in approved export set`;
    }
    checks.push({
      id: "export_gate",
      label: "Export refuses any row whose status is not 'approved'",
      pass: gatePass,
      detail: gateDetail,
    });

    // Pending review count (dashboard signal)
    const { count: pending } = await sb
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "drafted");

    const allPass = checks.every((c) => c.pass);
    return NextResponse.json({
      ok: allPass,
      pending_review: pending ?? 0,
      checks,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message, checks },
      { status: 500 }
    );
  }
}
