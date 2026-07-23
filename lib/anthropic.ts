import Anthropic from "@anthropic-ai/sdk";
import type { Campaign, Podcast } from "./types";

const SCORING_MODEL = process.env.SCORING_MODEL || "claude-haiku-4-5-20251001";
const DRAFTING_MODEL = process.env.DRAFTING_MODEL || "claude-sonnet-5";

function client() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY.");
  return new Anthropic({ apiKey: key });
}

/** Pull the first JSON object out of a model response. */
function parseJson<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

// ---------- Scoring (Haiku, bulk) ----------
export interface ScoreResult {
  score: number;
  reasoning: string;
}

export async function scorePodcast(
  campaign: Campaign,
  pod: Podcast
): Promise<ScoreResult> {
  const epis = (pod.recent_episode_titles || []).slice(0, 5);
  const prompt = `You score how well a podcast fits a guest-pitch campaign.

CAMPAIGN FOCUS:
${campaign.pitch_focus || campaign.name}

TARGET THEMES: ${campaign.target_keywords.join(", ")}

PODCAST: "${pod.title}"
DESCRIPTION: ${(pod.description || "").slice(0, 800)}
RECENT EPISODES:
${epis.length ? epis.map((t) => `- ${t}`).join("\n") : "(none available)"}

Return ONLY JSON: {"score": <0-100 integer>, "reasoning": "<one sentence>"}
Score high only if this show would plausibly book a guest on the campaign's themes.`;

  const res = await client().messages.create({
    model: SCORING_MODEL,
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const parsed = parseJson<ScoreResult>(text);
  if (!parsed || typeof parsed.score !== "number") {
    return { score: 0, reasoning: "Could not parse score." };
  }
  return {
    score: Math.max(0, Math.min(100, Math.round(parsed.score))),
    reasoning: parsed.reasoning || "",
  };
}

// ---------- Drafting (Sonnet, per-show) ----------
export interface DraftResult {
  subject: string;
  body: string;
  icebreaker: string;
  detail_cited: string;
}

export async function draftPitch(
  campaign: Campaign,
  pod: Podcast
): Promise<DraftResult> {
  const epis = (pod.recent_episode_titles || []).slice(0, 5);
  const prompt = `You write a tailored cold guest-pitch email for a podcast.

GUEST: Marcus Gray, author of "The Physics of Hip-Hop: Hip-Hop Grimoire"
(Amazon 2024). The book frames hip-hop as consciousness technology, shamanism,
and occult practice, drawn from 20+ years of research.

CAMPAIGN FOCUS: ${campaign.pitch_focus || ""}
GUEST BIO: ${campaign.guest_bio || ""}
TALKING POINTS:
${(campaign.talking_points || []).map((t) => `- ${t}`).join("\n")}

TARGET SHOW: "${pod.title}"
SHOW DESCRIPTION: ${(pod.description || "").slice(0, 800)}
RECENT EPISODES:
${epis.length ? epis.map((t) => `- ${t}`).join("\n") : "(none available)"}

Write a pitch that:
- references a SPECIFIC recent episode or concrete detail from THIS show,
- introduces Marcus + the book + ONE guest angle tailored to the show,
- ends with a soft call to action,
- stays under ~180 words, warm and non-generic.

Also write a one-sentence "icebreaker": a show-specific opening line ONLY
(for Instantly personalization). It must cite the specific show detail.

Return ONLY JSON:
{"subject": "...", "body": "...", "icebreaker": "...", "detail_cited": "<the specific episode/detail you referenced>"}`;

  const res = await client().messages.create({
    model: DRAFTING_MODEL,
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const parsed = parseJson<DraftResult>(text);
  if (!parsed || !parsed.body) {
    throw new Error("Draft generation returned unparseable output.");
  }
  return {
    subject: parsed.subject || `Guest pitch for ${pod.title}`,
    body: parsed.body,
    icebreaker: parsed.icebreaker || "",
    detail_cited: parsed.detail_cited || "",
  };
}
