-- Run in the NEW project (ticobtvzquniifnqnaju) SQL editor. These 3 tables are empty and were created with the wrong columns.
drop table if exists public.email_queue cascade;
drop table if exists public.email_sends cascade;
drop table if exists public.push_subscriptions cascade;

-- ============================================================================
-- LCL Ops — Email send tracking
-- One row per outbound email (campaign or 1:1). Lets us enforce the daily
-- Gmail cap, surface a per-prospect email history, and match inbound replies
-- back to the original send so the "Replied" funnel actually works.
-- Run in Supabase SQL Editor.
-- ============================================================================

create table if not exists email_sends (
  id            text primary key,
  to_email      text not null,
  subject       text,
  status        text not null,                -- 'sent' | 'failed' | 'replied'
  sent_at       timestamptz not null default now(),
  sent_by       uuid,                         -- auth.users.id of the sender (null for system)
  message_id    text,                         -- SMTP Message-ID header — used to match replies
  prospect_id   text,
  campaign_label text,
  error         text,
  replied_at    timestamptz,
  reply_snippet text,
  data          jsonb not null default '{}'::jsonb
);

-- Reply matching: most-recent sent email to this address.
create index if not exists email_sends_to_email_idx
  on email_sends (lower(to_email), sent_at desc);

-- "What did I send today?" — used by the quota enforcer and the dashboard.
create index if not exists email_sends_sent_at_idx
  on email_sends (sent_at desc);

-- "Show this prospect's email history."
create index if not exists email_sends_prospect_idx
  on email_sends (prospect_id);

-- RLS — same shape as the rest of Phase 1 (any authenticated user). When RLS
-- hardening lands in a later session this will tighten to role + ownership.
alter table email_sends enable row level security;

drop policy if exists "auth all email_sends" on email_sends;
create policy "auth all email_sends"
  on email_sends for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================================
-- LCL Ops — Email queue (scheduled follow-up / chase emails)
-- One row per future email we plan to send. The worker at
-- /api/email-queue/process picks up `pending` rows whose scheduled_for has
-- passed, sends them, and updates the status. Replies cancel pending rows
-- automatically (via the Gmail webhook) so we don't pester someone who
-- already responded.
-- Run in Supabase SQL Editor after email_sends.sql.
-- ============================================================================

create table if not exists email_queue (
  id                text primary key,
  prospect_id       text,
  to_email          text not null,
  subject           text not null,
  body              text not null,
  from_name         text,
  reply_to          text,
  bcc               text,
  campaign_label    text,
  parent_send_id    text,                            -- email_sends.id of the original send
  step_index        int not null default 1,          -- 1 = first chase, 2 = second, etc.
  scheduled_for     timestamptz not null,
  status            text not null default 'pending', -- 'pending' | 'sent' | 'cancelled' | 'failed'
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  sent_send_id      text,                            -- email_sends.id once sent
  cancelled_reason  text,
  failure_reason    text,
  created_by        uuid,
  data              jsonb not null default '{}'::jsonb
);

-- Worker reads pending items past their scheduled time. Partial index keeps
-- the hot query fast even when most rows have already been processed.
create index if not exists email_queue_due_idx
  on email_queue (scheduled_for)
  where status = 'pending';

-- Cancel-on-reply lookups: pending items for a given prospect.
create index if not exists email_queue_prospect_idx
  on email_queue (prospect_id)
  where status = 'pending';

-- Email-log "Scheduled chases" view.
create index if not exists email_queue_status_idx
  on email_queue (status, scheduled_for desc);

alter table email_queue enable row level security;
drop policy if exists "auth all email_queue" on email_queue;
create policy "auth all email_queue"
  on email_queue for all
  to authenticated
  using (true)
  with check (true);

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
drop policy if exists "own push subscriptions" on push_subscriptions;
create policy "own push subscriptions" on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

-- Make the API pick up the new columns immediately
notify pgrst, 'reload schema';

-- Security report: every public table should show rls_enabled = true
select c.relname as table_name, c.relrowsecurity as rls_enabled, (select count(*) from pg_policies p where p.tablename=c.relname) as policies from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 2,1;
