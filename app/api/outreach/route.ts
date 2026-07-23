import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/outreach { matchId, subject?, body?, icebreaker?, viewed? }
 * Autosaves focus-view edits and records that the reviewer has actually
 * viewed the pitch (used to gate the Approve button server-side too).
 */
export async function PATCH(req: Request) {
  try {
    const sb = getServiceClient();
    const body = await req.json();
    const { matchId } = body;
    if (!matchId) {
      return NextResponse.json({ error: "matchId required" }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if ("subject" in body) patch.subject = body.subject;
    if ("body" in body) patch.body = body.body;
    if ("icebreaker" in body) patch.icebreaker = body.icebreaker;
    if (body.viewed) patch.viewed_at = new Date().toISOString();

    const { data, error } = await sb
      .from("outreach")
      .update(patch)
      .eq("match_id", matchId)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ outreach: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
