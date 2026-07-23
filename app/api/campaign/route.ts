import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getOrSeedCampaign } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const campaign = await getOrSeedCampaign();
    return NextResponse.json({ campaign });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const campaign = await getOrSeedCampaign();
    const body = await req.json();
    const patch: Record<string, unknown> = {};
    for (const k of [
      "name",
      "pitch_focus",
      "guest_bio",
      "talking_points",
      "target_keywords",
    ]) {
      if (k in body) patch[k] = body[k];
    }
    const sb = getServiceClient();
    const { data, error } = await sb
      .from("campaigns")
      .update(patch)
      .eq("id", campaign.id)
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ campaign: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
