-- ============================================================================
-- LCL Ops — Tasks (team task assignment + tracking)
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================================
-- Freeform tasks any team member can create and assign to themselves, a
-- named teammate, or "everyone". Kept as one jsonb blob per row, same
-- pattern as prospects/jobs/clients, so the whole team (agents + admin) can
-- see and complete them — not locked down per-owner like push_subscriptions.

create table if not exists tasks (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "auth all tasks" on tasks
  for all to authenticated using (true) with check (true);

create index if not exists tasks_updated_idx on tasks (updated_at desc);
