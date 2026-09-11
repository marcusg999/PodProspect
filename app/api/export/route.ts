import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getOrSeedCampaign } from "@/lib/seed";
import { toCsv, firstNameOf } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "email",
  "first_name",
  "company_name",
  "icebreaker",
  "full_pitch",
  "website",
  "feed_url",
];

/**
 * POST /api/export
 * HARD RULE: exports ONLY matches with status='approved' AND a valid email.
 * Drafted/unapproved/unreviewed rows are hard-filtered — they cannot appear
 * even if their ids are passed in. On success: status='exported',
 * exported_at=now, follow_up_at=+7 days.
 *
 * body: { preview?: boolean, ids?: string[] }  (ids only narrow the approved set)
 */
export async function POST(req: Request) {
  try {
    const campaign = await getOrSeedCampaign();
    const sb = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const preview: boolean = !!body.preview;
    const narrowIds: string[] | null = Array.isArray(body.ids) ? body.ids : null;

    // Hard gate: status='approved' only.
    let q = sb
      .from("matches")
      .select("*, podcast:podcasts(*), outreach:outreach(*)")
      .eq("campaign_id", campaign.id)
      .eq("status", "approved");
    if (narrowIds && narrowIds.length) q = q.in("id", narrowIds);

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map((r: any) => ({
      ...r,
      outreach: Array.isArray(r.outreach) ? r.outreach[0] ?? null : r.outreach,
    }));

    // Only rows with a valid, non-empty email.
    const exportable = rows.filter(
      (r: any) => r.podcast?.owner_email && r.podcast.owner_email.includes("@")
    );

    const csvRows = exportable.map((r: any) => [
      r.podcast.owner_email,
      firstNameOf(r.podcast.owner_name),
      r.podcast.title || "",
      r.outreach?.icebreaker || "",
      r.outreach?.body || "",
      r.podcast.website || "",
      r.podcast.feed_url || "",
    ]);

    const csv = toCsv(HEADERS, csvRows);

    if (preview) {
      return NextResponse.json({
        approved_total: rows.length,
        exportable: exportable.length,
        skipped_no_email: rows.length - exportable.length,
      });
    }

    // Commit: flip to exported, set timestamps.
    const followUp = new Date(Date.now() + 7 * 86400000).toISOString();
    const exportedAt = new Date().toISOString();
    const ids = exportable.map((r: any) => r.id);
    if (ids.length) {
      await sb.from("matches").update({ status: "exported" }).in("id", ids);
      await sb
        .from("outreach")
        .update({ exported_at: exportedAt, follow_up_at: followUp })
        .in("match_id", ids);
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="podprospect-instantly-${
          new Date().toISOString().slice(0, 10)
        }.csv"`,
        "X-Exported-Count": String(ids.length),
      },
    });
  } catch (e: any) {
    console.error("[export] error", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
