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
