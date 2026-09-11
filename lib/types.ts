export type EmailSource = "rss" | "scraped" | "manual";

export type MatchStatus =
  | "new"
  | "shortlisted"
  | "drafted"
  | "approved"
  | "exported"
  | "replied"
  | "booked"
  | "passed";

export interface Campaign {
  id: string;
  name: string;
  pitch_focus: string | null;
  guest_bio: string | null;
  talking_points: string[];
  target_keywords: string[];
  created_at: string;
}

export interface Podcast {
  id: string;
  source: string | null;
  source_id: string | null;
  title: string | null;
  description: string | null;
  feed_url: string;
  website: string | null;
  categories: string[];
  owner_name: string | null;
  owner_email: string | null;
  itunes_id: string | null;
  artwork_url: string | null;
  last_episode_at: string | null;
  episode_count: number | null;
  recent_episode_titles: string[];
  enriched_at: string | null;
  active: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  podcast_id: string;
  name: string | null;
  email: string | null;
  email_source: EmailSource;
  confidence: number;
  created_at: string;
}

export interface MatchRow {
  id: string;
  campaign_id: string;
  podcast_id: string;
  relevance_score: number | null;
  reasoning: string | null;
  status: MatchStatus;
  created_at: string;
  updated_at: string;
}

export interface Outreach {
  id: string;
  match_id: string;
  subject: string | null;
  body: string | null;
  icebreaker: string | null;
  detail_cited: string | null;
  viewed_at: string | null;
  exported_at: string | null;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A match joined with its podcast (+ optional outreach) for the UI. */
export interface MatchWithPodcast extends MatchRow {
  podcast: Podcast;
  outreach?: Outreach | null;
}
