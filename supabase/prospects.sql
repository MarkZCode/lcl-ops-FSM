-- ============================================================================
-- LCL Ops — Prospects table (renewal-outreach pipeline)
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================================
-- Prospects are past compliance clients we reach out to for renewals. They are
-- kept SEPARATE from real `clients`/`jobs` so outreach data never pollutes live
-- operations; a prospect becomes a real client+job only when they book in.

create table if not exists prospects (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table prospects enable row level security;

-- Phase 1: authenticated office users have full access (mirrors auth-security.sql).
create policy "auth all prospects" on prospects
  for all to authenticated using (true) with check (true);

create index if not exists prospects_updated_idx on prospects (updated_at desc);
