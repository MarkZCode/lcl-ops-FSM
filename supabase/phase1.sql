-- ============================================================================
-- Phase 1 migration — FSM redesign (CLAUDE-CODE-HANDOFF.md §7 + §11)
--
-- Run this once in the Supabase SQL editor. It is idempotent and
-- backwards-compatible — old code paths that still read `cold_leads` keep
-- working until the 30-day redirect window closes.
--
-- What this does:
--   1. Creates the new `leads` table (replaces `cold_leads` in §4.4).
--   2. Copies every row from `cold_leads` into `leads` (only if empty).
--   3. Creates the `letting_agents` table (§4.3).
--   4. Creates the `engineer_recruits` table (§4.5).
--   5. Adds queue-performance indexes on (stage, next_action_at) per §7.
--
-- Field additions to existing tables (jobs.statusHistory, leads.attempt_count,
-- leads.source, prospects.notes_from_last_job) are jsonb keys — no DDL needed;
-- they materialise the first time the app writes them.
-- ============================================================================

-- 1. leads (renamed from cold_leads) -----------------------------------------
create table if not exists leads (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table leads enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'leads' and policyname = 'auth all leads'
  ) then
    create policy "auth all leads" on leads
      for all to authenticated using (true) with check (true);
  end if;
end $$;

create index if not exists leads_updated_idx on leads (updated_at desc);
create index if not exists leads_stage_idx on leads ((data->>'stage'));
create index if not exists leads_next_action_idx on leads ((data->>'next_action_at'));

-- Backfill from cold_leads on first run only (idempotent — skip if anything is there).
do $$
begin
  if (select count(*) from leads) = 0 and exists (select 1 from information_schema.tables where table_name = 'cold_leads') then
    insert into leads (id, data, updated_at)
    select id, data, updated_at from cold_leads
    on conflict (id) do nothing;
  end if;
end $$;

-- 2. letting_agents ----------------------------------------------------------
create table if not exists letting_agents (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table letting_agents enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'letting_agents' and policyname = 'auth all letting_agents'
  ) then
    create policy "auth all letting_agents" on letting_agents
      for all to authenticated using (true) with check (true);
  end if;
end $$;

create index if not exists letting_agents_updated_idx on letting_agents (updated_at desc);
create index if not exists letting_agents_stage_idx on letting_agents ((data->>'stage'));
create index if not exists letting_agents_next_action_idx on letting_agents ((data->>'next_action_at'));

-- 3. engineer_recruits -------------------------------------------------------
create table if not exists engineer_recruits (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table engineer_recruits enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'engineer_recruits' and policyname = 'auth all engineer_recruits'
  ) then
    create policy "auth all engineer_recruits" on engineer_recruits
      for all to authenticated using (true) with check (true);
  end if;
end $$;

create index if not exists engineer_recruits_updated_idx on engineer_recruits (updated_at desc);
create index if not exists engineer_recruits_stage_idx on engineer_recruits ((data->>'stage'));
create index if not exists engineer_recruits_next_action_idx on engineer_recruits ((data->>'next_action_at'));

-- 4. queue-performance indexes on existing tables ----------------------------
create index if not exists prospects_stage_idx on prospects ((data->>'stage'));
create index if not exists prospects_next_action_idx on prospects ((data->>'next_action_at'));

-- ============================================================================
-- Post-migration: the old cold_leads table is NOT dropped — it stays
-- read-only-by-convention for the 30-day cutover window (§11). Drop it
-- manually once you've verified the new `leads` table is fully populated and
-- the redirect is no longer needed:
--
--   drop table cold_leads cascade;
-- ============================================================================
