import { NextResponse } from "next/server";
import { getOrSeedCampaign } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const campaign = await getOrSeedCampaign();
    return NextResponse.json({ ok: true, campaign });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
