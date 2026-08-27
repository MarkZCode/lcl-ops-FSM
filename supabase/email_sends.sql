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
