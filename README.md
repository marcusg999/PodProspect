# PodProspect

A personal, single-user podcast **guest-booking prospecting + outreach** tool.
It finds relevant podcasts across the open podcast ecosystem, extracts host
contact info, scores fit with Claude, drafts tailored guest-pitch content, and
exports a **shortlist of approved leads as a CSV** for cold outreach via
[Instantly.ai](https://instantly.ai).

> This is **not** a marketplace — there are no host signups and no member pool.
> Single user (me). It does **not** send email — Instantly handles sending.
> PodProspect's job ends at an approved, exportable CSV.

Seeded campaign: **"The Physics of Hip-Hop"** — pitching Marcus Gray as a guest
to discuss *The Physics of Hip-Hop: Hip-Hop Grimoire* (Amazon 2024, endorsed by
Saul Williams).

---

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind + shadcn-style UI
- **Supabase** (Postgres + RLS) — single-user, magic-link auth
- **Anthropic API** — Haiku for bulk scoring, Sonnet for pitch drafts
- **Firecrawl** — contact-page fallback scraping
- **Data sources (free only):** Podcast Index API (primary) + iTunes Search (secondary)
- **Deploy:** Vercel (Railway-compatible)

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment variables

Copy `.env.local.example` → `.env.local` and fill in:

| Var | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Scoring (Haiku) + drafting (Sonnet) |
| `PODCAST_INDEX_KEY` / `PODCAST_INDEX_SECRET` | Podcast Index API (SHA-1 auth) |
| `FIRECRAWL_API_KEY` | Contact-page fallback scraping |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (browser auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Never exposed to the client. |

Optional overrides: `SCORING_MODEL`, `DRAFTING_MODEL`, `ALLOWED_EMAIL`.

**All API keys are used server-side only.** The service_role key is read only in
`lib/supabase/server.ts`, which is imported exclusively by API routes.

### 3. Database

Run the migration in the Supabase SQL editor (or `supabase db push`):

```
supabase/migrations/0001_init.sql
```

This creates `campaigns`, `podcasts`, `contacts`, `matches`, `outreach`,
`search_runs`, the enums, indexes, and RLS policies.

### 4. Run

```bash
npm run dev
```

On first load, the app **seeds the "The Physics of Hip-Hop" campaign**
automatically (via `getOrSeedCampaign`). You can also POST `/api/seed`.

---

## The pipeline: search → enrich → score → draft → export

Everything is driven from the **Dashboard** (`/`) as ordered steps, or by
calling the API routes directly.

1. **Search** — `POST /api/search`
   For each target keyword, queries **Podcast Index** (`/search/byterm`) *and*
   **iTunes Search**. Results are normalized and **deduped by `feed_url`**
   (never by title — many shows share titles), then upserted into `podcasts`.
   One `search_runs` row is logged per keyword.

2. **Enrich** — `POST /api/enrich` (background, batched)
   Fetches and parses each new RSS feed for `itunes:owner` email + name,
   website, last-episode `pubDate`, and episode count. Sets
   `active = (last episode within 120 days)`. **If there's no owner email**, it
   calls **Firecrawl** on the site's `/contact` → `/about` → homepage and stores
   the best email as `email_source='scraped'` at lower confidence. iTunes is
   throttled to ~19/min with exponential back-off; feeds are batched.

3. **Score** — `POST /api/score`
   For each **active** podcast (dormant shows are never scored), calls Claude
   **Haiku** with the description + recent episode titles + campaign focus and
   stores `{ relevance_score 0-100, reasoning }` in `matches`.

4. **Review** — `/review`
   Ranked table (score, title, categories, has-email / active badges, last
   episode). Filters: has-email, active-only, score threshold, status. Click a
   row for a detail drawer (description, recent episodes, feed link, contact),
   then **Shortlist** or **Pass**.

5. **Draft** — `POST /api/draft`
   For shortlisted matches, Claude **Sonnet** produces per show: a full editable
   pitch email (subject + body) referencing a **specific recent episode/detail**
   from *that* show, plus a one-sentence **icebreaker** for Instantly. Saving a
   draft sets `status='drafted'` — it lands in the review queue. **Nothing is
   ever auto-approved.**

6. **Approval queue** — `/queue` (see below)

7. **Export** — `POST /api/export`
   Operates **only** on `status='approved'` rows with a valid email. CSV columns:
   `email, first_name, company_name, icebreaker, full_pitch, website, feed_url`.
   On export: `status='exported'`, `exported_at=now`, `follow_up_at=+7 days`.

---

## The Approval Queue (deliberate-approval design)

`/queue` is a **full-page, one-pitch-at-a-time reader** — not a table of
checkboxes. The interface makes approving a considered act and rejecting fast.

- **Single-card focus view:** one drafted pitch fills the screen — show name +
  artwork, the specific episode/detail it cites, the full email (subject + body),
  and the icebreaker — all inline-editable. Edits **autosave** before any
  approve/reject.
- **Queue rail** lists pending drafts with position (“3 of 17 pending review”).
- **Approve (one at a time, only):** a single Approve button, active only for the
  open pitch. Approving advances to the next pending pitch. There is **no
  “Approve all,” no select-all-approve, no multi-select approve** — approval
  cannot be batched by any path. The button is **disabled until the pitch has
  actually been viewed** (focus card open ~2s **or** the body scrolled/focused).
  Keyboard `A` approves the **open** pitch only.
- **Reject (bulk allowed):** rail multi-select + “Reject selected” moves several
  drafts back to `shortlisted` in one action; a single Reject on the focus card
  advances to the next.
- **Safety:** header always shows “Pending review: N.” The Export button is
  visible but disabled with tooltip *“Only approved pitches export”* whenever the
  selection includes anything not approved. Empty state: *“Nothing to review — N
  approved and ready to export.”*

**HARD RULE:** export is gated on `status='approved'`. A draft can never skip the
queue, and there is no bulk approve shortcut — the human approval step is
mandatory.

---

## Verification checklist

Open **`/health`** (or `GET /api/health`) — a seed-check page that proves:

- ✅ search returns shows with resolvable `feed_url`s
- ✅ ≥ 5 shows have a parsed `itunes:owner` email from their live feed
- ✅ top-5 and bottom-5 scores are sane for the campaign
- ✅ every generated draft + icebreaker cites a specific show detail
- ✅ every exported CSV row has a non-empty email
- ✅ no duplicate `feed_url`s exist
- ✅ export refuses any row whose status is not `approved` (tested with a drafted row)

UI guarantees, also verifiable by inspection:
- no control approves more than one pitch per action (no approve-all path)
- the Approve button is disabled until the open pitch has been viewed
- bulk-reject moves multiple drafts back to `shortlisted` in one action

---

## Gotchas (handled)

- **Missing owner email is expected** in music/spirituality feeds (~40–60%
  coverage). Shows a clear “no email” state and relies on the Firecrawl fallback.
- **Podcast Index needs SHA-1 auth** (`X-Auth-Date`, `X-Auth-Key`,
  `Authorization = sha1(key+secret+date)`) — implemented in `lib/podcastindex.ts`.
- **iTunes rate-limits hard** — throttled to ~19/min with back-off in `lib/itunes.ts`.
- **RSS owner emails can be generic/stale** — `email_source` + `confidence` are
  surfaced so you judge before exporting.
- **Dedupe on `feed_url`, not title.**
- **Instantly CSV keeps the icebreaker as its own column** so one template +
  `{{icebreaker}}` handles personalization.
- **Firecrawl bills per page** — only called when the RSS email is missing, and
  the result is cached on the podcast/contact row.
- **Service_role key is server-side only** — never shipped to the browser.

---

## Deploy

Deploy to Vercel; set all env vars in the project settings. Run the migration
against your Supabase project first. The app seeds the campaign on first request.
