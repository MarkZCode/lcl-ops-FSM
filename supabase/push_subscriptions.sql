-- ============================================================================
-- LCL Ops — Push subscriptions (browser/phone Web Push)
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================================
-- One row per device that's enabled notifications (a user with phone + laptop
-- both enabled gets two rows). The cron digest sends to every row.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

-- Each user manages only their own device subscriptions.
create policy "own push subscriptions" on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
