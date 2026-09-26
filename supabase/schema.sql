drop table if exists events, approvals, messages, deals, listings, briefs cascade;
create extension if not exists pgcrypto;

create table briefs (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  item text not null,
  keywords text[] not null default '{}',        -- e.g. {bike, road bike}
  size_token text,                              -- e.g. '54cm' (hard requirement if set)
  min_condition text not null default 'good',   -- like new | very good | good | fair
  location text,
  availability text,
  target_price int not null,
  max_price int not null,                       -- SECRET
  agent_mode text not null default 'autopilot' check (agent_mode in ('grokbot','autopilot')),
  created_at timestamptz not null default now()
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('sandbox','real')),
  platform text not null,                       -- 'Kerbside (test)', 'eBay', 'Gumtree'
  url text,
  title text not null,
  description text,
  category text,
  condition text,
  asking_price int not null,
  location text,
  seller_name text,
  seller_mode text check (seller_mode in ('agent','human')),
  persona text check (persona in ('agent_fair','agent_haggler','agent_firm',
    'human_ghost','human_scammer','human_sold')),
  floor_price int,                              -- SECRET (seller side)
  known_issue text,                             -- seller agents disclose this when asked
  issue_severity text not null default 'none' check (issue_severity in ('none','minor','major')),
  seller_rating numeric(2,1),
  seller_reviews_count int not null default 0,
  seller_since date,
  seller_reviews text[] not null default '{}',
  seller_feedback text,                         -- free text for real listings, e.g. '99.4% positive (1.2k)'
  emoji text,
  brief_id uuid references briefs(id) on delete cascade,   -- real listings belong to a hunt
  created_at timestamptz not null default now()
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references briefs(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  status text not null default 'new' check (status in ('new','skipped','contacted',
    'negotiating','agreed_pending_approval','approved','declined','walked_away','ghosted',
    'scam_blocked','sold','closed_other')),
  deal_score int,
  score jsonb not null default '{}',            -- {fit, trust, condition, price, flags, skipReason}
  agreed_price int,
  last_action text,
  reason_codes text[] not null default '{}',
  first_contact_at timestamptz,
  agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_id, listing_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  sender text not null check (sender in ('buyer_agent','seller','system')),
  body text not null,
  price int,                                    -- £ amount proposed/accepted, if any
  intent text,
  meta jsonb not null default '{}',             -- seller replies: {issues, issue_text}
  created_at timestamptz not null default now()
);
create index on messages (deal_id, created_at);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  price int not null,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table events (
  id bigserial primary key,
  brief_id uuid not null references briefs(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table briefs enable row level security;
alter table listings enable row level security;
alter table deals enable row level security;
alter table messages enable row level security;
alter table approvals enable row level security;
alter table events enable row level security;
