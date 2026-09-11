import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getOrSeedCampaign } from "@/lib/seed";
import type { MatchStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/matches?status=&hasEmail=&activeOnly=&minScore=
export async function GET(req: Request) {
  try {
    const campaign = await getOrSeedCampaign();
    const sb = getServiceClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const hasEmail = url.searchParams.get("hasEmail") === "true";
    const activeOnly = url.searchParams.get("activeOnly") === "true";
    const minScore = parseInt(url.searchParams.get("minScore") || "0", 10);

    let q = sb
      .from("matches")
      .select("*, podcast:podcasts(*), outreach:outreach(*)")
      .eq("campaign_id", campaign.id)
      .order("relevance_score", { ascending: false, nullsFirst: false });

    if (status) q = q.eq("status", status);
    if (minScore > 0) q = q.gte("relevance_score", minScore);

    const { data, error } = await q;
    if (error) throw error;

    let rows = (data || []).map((r: any) => ({
      ...r,
      outreach: Array.isArray(r.outreach) ? r.outreach[0] ?? null : r.outreach,
    }));

    if (activeOnly) rows = rows.filter((r: any) => r.podcast?.active);
    if (hasEmail) rows = rows.filter((r: any) => !!r.podcast?.owner_email);

    return NextResponse.json({ matches: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/matches  { ids: string[], status }  — single or bulk status change.
export async function PATCH(req: Request) {
  try {
    const sb = getServiceClient();
    const body = await req.json();
    const ids: string[] = body.id ? [body.id] : body.ids || [];
    const status: MatchStatus = body.status;
    if (!ids.length || !status) {
      return NextResponse.json({ error: "ids and status required" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("matches")
      .update({ status })
      .in("id", ids)
      .select("id, status");
    if (error) throw error;
    return NextResponse.json({ updated: data?.length ?? 0, status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
