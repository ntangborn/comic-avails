-- =============================================================================
-- Comic Avails — initial schema
-- Source of truth: comic-avails-prd.md §6.1 (core schema) and §4.1 (distributors)
-- Target: Supabase / PostgreSQL 15+  (uses UNIQUE ... NULLS NOT DISTINCT, PG15+)
--
-- RLS model:
--   Public read  : publishers, series, items, creators, item_creators
--   Owner-only   : pull_lists, pull_list_items, subscriptions  (via auth.uid())
--   Backend-only : distributors, publisher_distributor, ingest_runs
--                  (RLS enabled with NO policy -> only the service_role key,
--                   which BYPASSRLS, can read/write them)
--   Catalog writes are performed by the ingestion jobs using the service_role
--   key, which bypasses RLS; hence catalog tables expose only a read policy.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;   -- typo-tolerant title/series search (PRD §5.1)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type item_status as enum (
  'solicited', 'foc_passed', 'shipped', 'delayed', 'cancelled', 'resolicited'
);

create type distributor_role as enum ('primary', 'secondary');   -- PRD §4.1

create type pull_item_state as enum ('want', 'submitted', 'received');  -- PRD §5.2

-- ---------------------------------------------------------------------------
-- Catalog tables
-- ---------------------------------------------------------------------------
create table publishers (
  id   bigint generated always as identity primary key,
  name text not null unique,
  slug text not null unique
);

create table distributors (
  id   bigint generated always as identity primary key,
  name text not null unique
);

-- Publisher -> distributor mapping is DATA, not code (PRD §4.1): distributors
-- change over time (e.g. Oni moves Lunar -> PRH on 2026-08-01), so every row
-- carries an effective date span.
create table publisher_distributor (
  id             bigint generated always as identity primary key,
  publisher_id   bigint not null references publishers(id)   on delete cascade,
  distributor_id bigint not null references distributors(id) on delete cascade,
  role           distributor_role not null default 'primary',
  effective_from date not null,
  effective_to   date,
  constraint pd_effective_range check (effective_to is null or effective_to >= effective_from),
  constraint pd_unique_span unique (publisher_id, distributor_id, role, effective_from)
);
create index pd_publisher_idx on publisher_distributor (publisher_id);

create table series (
  id           bigint generated always as identity primary key,
  publisher_id bigint not null references publishers(id) on delete cascade,
  name         text not null,
  metron_id    bigint,
  start_year   int
);
create index series_publisher_idx on series (publisher_id);
create unique index series_metron_idx on series (metron_id) where metron_id is not null;
create index series_name_trgm_idx on series using gin (name gin_trgm_ops);

create table creators (
  id        bigint generated always as identity primary key,
  name      text not null,
  metron_id bigint
);
create unique index creators_metron_idx on creators (metron_id) where metron_id is not null;

create table items (
  id               bigint generated always as identity primary key,
  series_id        bigint references series(id) on delete cascade,   -- nullable: one-shots
  publisher_id     bigint not null references publishers(id) on delete cascade,
  title_raw        text not null,
  issue_number     text,          -- text: comics use #½, #-1, annuals, etc.
  format           text,          -- single issue / TP / HC / omnibus
  variant_code     text,          -- null = base (A) cover
  cover_artist     text,
  price_cents      integer,
  street_date      date,
  foc_date         date,
  solicit_text     text,
  cover_url        text,
  item_code_lunar  text,
  item_code_prh    text,
  status           item_status not null default 'solicited',
  source           text,
  last_verified_at timestamptz,
  created_at       timestamptz not null default now(),
  -- Prevent duplicate ingests. NULLS NOT DISTINCT (PG15+) so that a null
  -- variant_code (base cover) or null issue_number still collides on re-ingest;
  -- with default NULLS DISTINCT semantics every null would be treated as unique
  -- and duplicates would slip through.
  constraint items_dedup_key unique nulls not distinct
    (publisher_id, series_id, issue_number, variant_code)
);
create index items_foc_date_idx    on items (foc_date);      -- default "This Week's FOC" 7-day range (PRD §5.1)
create index items_street_date_idx on items (street_date);   -- weekly street-date calendar view (PRD §5.1)
create index items_series_idx      on items (series_id);
create index items_publisher_idx   on items (publisher_id);
create index items_title_trgm_idx  on items using gin (title_raw gin_trgm_ops);

create table item_creators (
  item_id    bigint not null references items(id)    on delete cascade,
  creator_id bigint not null references creators(id) on delete cascade,
  role       text not null,       -- writer / artist / cover / etc.
  primary key (item_id, creator_id, role)
);
create index item_creators_creator_idx on item_creators (creator_id);

-- ---------------------------------------------------------------------------
-- User-owned tables
-- ---------------------------------------------------------------------------
create table pull_lists (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  shop_name     text,
  customer_name text,
  created_at    timestamptz not null default now()
);
create index pull_lists_user_idx on pull_lists (user_id);

create table pull_list_items (
  id           bigint generated always as identity primary key,
  pull_list_id bigint not null references pull_lists(id) on delete cascade,
  item_id      bigint not null references items(id)      on delete cascade,
  qty          integer not null default 1 check (qty > 0),
  state        pull_item_state not null default 'want',
  added_at     timestamptz not null default now(),
  unique (pull_list_id, item_id)
);
create index pull_list_items_item_idx on pull_list_items (item_id);

create table subscriptions (
  user_id      uuid   not null references auth.users(id) on delete cascade,
  series_id    bigint not null references series(id)     on delete cascade,
  variant_pref text,
  created_at   timestamptz not null default now(),
  primary key (user_id, series_id)
);

-- ---------------------------------------------------------------------------
-- Ops table (back-end only)
-- ---------------------------------------------------------------------------
create table ingest_runs (
  id             bigint generated always as identity primary key,
  source         text not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running',   -- running / success / failed
  items_upserted integer not null default 0,
  log            jsonb
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table publishers            enable row level security;
alter table distributors          enable row level security;
alter table publisher_distributor enable row level security;
alter table series                enable row level security;
alter table creators              enable row level security;
alter table items                 enable row level security;
alter table item_creators         enable row level security;
alter table pull_lists            enable row level security;
alter table pull_list_items       enable row level security;
alter table subscriptions         enable row level security;
alter table ingest_runs           enable row level security;

-- Public read on catalog tables (applies to the `public` role => anon + authenticated)
create policy "catalog public read" on publishers    for select using (true);
create policy "catalog public read" on series        for select using (true);
create policy "catalog public read" on items         for select using (true);
create policy "catalog public read" on creators      for select using (true);
create policy "catalog public read" on item_creators for select using (true);

-- pull_lists: readable/writable only by the owning user
create policy "own pull_lists" on pull_lists
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- pull_list_items: ownership derived from the parent pull_list
create policy "own pull_list_items" on pull_list_items
  for all to authenticated
  using (exists (
    select 1 from pull_lists pl
    where pl.id = pull_list_items.pull_list_id and pl.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from pull_lists pl
    where pl.id = pull_list_items.pull_list_id and pl.user_id = auth.uid()
  ));

-- subscriptions: readable/writable only by the owning user
create policy "own subscriptions" on subscriptions
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NOTE: distributors, publisher_distributor and ingest_runs have RLS enabled
-- with NO policy, so they are reachable only via the service_role key
-- (ingestion / server-side). Add a `for select using (true)` policy here if the
-- client ever needs to read the distributor mapping directly.

-- ===========================================================================
-- Grants  (RLS is the effective gate; these establish base table privileges)
-- ===========================================================================
grant usage on schema public to anon, authenticated;

grant select on publishers, series, items, creators, item_creators
  to anon, authenticated;

grant select, insert, update, delete on pull_lists, pull_list_items, subscriptions
  to authenticated;

-- ===========================================================================
-- Seed data
-- ===========================================================================

-- Publishers (PRD §2 goals / §4.1)
insert into publishers (name, slug) values
  ('Marvel',        'marvel'),
  ('DC',            'dc'),
  ('Image',         'image'),
  ('Dark Horse',    'dark-horse'),
  ('Boom! Studios', 'boom-studios'),
  ('IDW',           'idw'),
  ('Titan',         'titan'),
  ('Dynamite',      'dynamite'),
  ('Oni Press',     'oni-press'),
  ('Mad Cave',      'mad-cave');

-- Distributors (PRD §4.1)
insert into distributors (name) values
  ('Lunar'),
  ('Penguin Random House'),
  ('Universal');

-- Publisher -> distributor mapping (PRD §4.1).
-- effective_from is grounded in PRD notes where stated (Marvel exclusive since
-- Oct 2021; Image left Diamond early 2025; Dynamite via Universal since Jan 2026;
-- DC to Lunar + Universal since mid-2020) and otherwise set to the post-Diamond
-- baseline of 2026-01-01 (the PRD's "July 2026" landscape snapshot) pending
-- verification. The Oni switch (Lunar -> PRH on 2026-08-01) is exact per PRD.
insert into publisher_distributor (publisher_id, distributor_id, role, effective_from, effective_to)
select p.id, d.id, m.role::distributor_role, m.effective_from, m.effective_to
from (values
  -- publisher_slug , distributor_name       , role       , effective_from  , effective_to
  ('dc',           'Lunar',                'primary',   date '2020-06-01', null),
  ('dc',           'Universal',            'secondary', date '2020-06-01', null),
  ('image',        'Lunar',                'primary',   date '2025-01-01', null),
  ('marvel',       'Penguin Random House', 'primary',   date '2021-10-01', null),
  ('dark-horse',   'Penguin Random House', 'primary',   date '2026-01-01', null),
  ('idw',          'Penguin Random House', 'primary',   date '2026-01-01', null),
  ('boom-studios', 'Penguin Random House', 'primary',   date '2026-01-01', null),
  ('oni-press',    'Lunar',                'primary',   date '2025-01-01', date '2026-07-31'),
  ('oni-press',    'Penguin Random House', 'primary',   date '2026-08-01', null),
  ('oni-press',    'Universal',            'secondary', date '2025-01-01', null),
  ('titan',        'Lunar',                'primary',   date '2026-01-01', null),
  ('dynamite',     'Lunar',                'primary',   date '2025-01-01', null),
  ('dynamite',     'Universal',            'secondary', date '2026-01-01', null),
  ('mad-cave',     'Lunar',                'primary',   date '2026-01-01', null)
) as m(publisher_slug, distributor_name, role, effective_from, effective_to)
join publishers   p on p.slug = m.publisher_slug
join distributors d on d.name = m.distributor_name;
