-- PodProspect schema — single-user podcast guest-booking prospecting tool.
-- Run in the Supabase SQL editor or via `supabase db push`.

-- ---------- Enums ----------
do $$ begin
  create type email_source as enum ('rss', 'scraped', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type match_status as enum (
    'new', 'shortlisted', 'drafted', 'approved',
    'exported', 'replied', 'booked', 'passed'
  );
exception when duplicate_object then null; end $$;

-- ---------- Tables ----------
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pitch_focus text,
  guest_bio text,
  talking_points text[] default '{}',
  target_keywords text[] default '{}',
  created_at timestamptz not null default now()
);

create table if not exists podcasts (
  id uuid primary key default gen_random_uuid(),
  source text,                       -- 'podcastindex' | 'itunes'
  source_id text,
  title text,
  description text,
  feed_url text unique not null,
  website text,
  categories text[] default '{}',
  owner_name text,
  owner_email text,
  itunes_id text,
  artwork_url text,
  last_episode_at timestamptz,
  episode_count int,
  recent_episode_titles text[] default '{}',
  enriched_at timestamptz,
  active boolean default false,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  name text,
  email text,
  email_source email_source not null default 'rss',
  confidence numeric default 0.5,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  podcast_id uuid not null references podcasts(id) on delete cascade,
  relevance_score int,
  reasoning text,
  status match_status not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, podcast_id)
);

create table if not exists outreach (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  subject text,
  body text,
  icebreaker text,
  detail_cited text,               -- the specific show detail referenced
  viewed_at timestamptz,           -- set when reviewer opens it in the queue
  exported_at timestamptz,
  follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id)
);

create table if not exists search_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  keyword text,
  results_count int,
  ran_at timestamptz not null default now()
);

-- ---------- Indexes ----------
create index if not exists idx_matches_campaign_status on matches(campaign_id, status);
create index if not exists idx_matches_score on matches(relevance_score desc);
create index if not exists idx_contacts_podcast on contacts(podcast_id);
create index if not exists idx_podcasts_active on podcasts(active);

-- ---------- updated_at triggers ----------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_matches_updated on matches;
create trigger trg_matches_updated before update on matches
  for each row execute function set_updated_at();

drop trigger if exists trg_outreach_updated on outreach;
create trigger trg_outreach_updated before update on outreach
  for each row execute function set_updated_at();

-- ---------- RLS ----------
-- Single-user app. Server routes use the service_role key (bypasses RLS).
-- Policies below allow any authenticated user (the single magic-link user)
-- to read/write via the anon/auth client if desired.
alter table campaigns  enable row level security;
alter table podcasts   enable row level security;
alter table contacts   enable row level security;
alter table matches    enable row level security;
alter table outreach   enable row level security;
alter table search_runs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['campaigns','podcasts','contacts','matches','outreach','search_runs']
  loop
    execute format('drop policy if exists "auth_all_%1$s" on %1$s;', t);
    execute format(
      'create policy "auth_all_%1$s" on %1$s for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
