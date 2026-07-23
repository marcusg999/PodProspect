import { getServiceClient } from "./supabase/server";
import type { Campaign } from "./types";

export const SEED_CAMPAIGN = {
  name: "The Physics of Hip-Hop",
  pitch_focus:
    'Pitching Marcus Gray as a guest to discuss his book "The Physics of Hip-Hop: Hip-Hop Grimoire" (Amazon 2024, endorsed by poet Saul Williams) — hip-hop as consciousness technology, shamanism, and occult practice; 20+ years of research.',
  guest_bio:
    "Marcus Gray is an author and researcher who spent 20+ years studying hip-hop as a spiritual and consciousness technology. His book \"The Physics of Hip-Hop: Hip-Hop Grimoire\" (2024) is endorsed by poet Saul Williams.",
  talking_points: [
    "Hip-hop as consciousness technology and a modern shamanic practice",
    "The occult and esoteric roots woven through hip-hop culture",
    "How rhythm, repetition, and rhyme function as manifestation tools",
    "20+ years of research behind the Hip-Hop Grimoire",
    "Saul Williams' endorsement and the poetry-mysticism lineage",
  ],
  target_keywords: [
    "hip-hop culture",
    "consciousness",
    "spirituality",
    "occult",
    "esoteric",
    "creativity",
    "music and mysticism",
    "shamanism",
    "manifestation",
    "artist interviews",
  ],
};

/** Get the single campaign, creating and seeding it on first run. */
export async function getOrSeedCampaign(): Promise<Campaign> {
  const sb = getServiceClient();
  const { data: existing } = await sb
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as Campaign;

  const { data, error } = await sb
    .from("campaigns")
    .insert(SEED_CAMPAIGN)
    .select("*")
    .single();
  if (error) throw error;
  return data as Campaign;
}
