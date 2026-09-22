-- ============================================================================
-- LCL Ops — THE FIVE TABLES MISSING FROM THE LIVE DATABASE
-- Run once, in the SQL Editor of project xtugdazykhpbblqawnym.
-- ============================================================================
--
-- CHECK THE PROJECT FIRST. The address bar must contain
-- `xtugdazykhpbblqawnym`. These tables already exist in the OLD project
-- (wsuimsjhjreqspvqpbbl) — that is exactly the mistake being corrected here:
-- every one of these migrations was run there and never on the live
-- database.
--
-- WHAT IS BROKEN UNTIL THIS RUNS
--   tasks               the whole task module. Every read errors and every
--                       "create task" fails, which is why the board looks
--                       empty and unmanageable — there is nothing behind it.
--   email_queue         scheduled / queued sending.
--   email_sends         the outbound email log, the per-prospect history,
--                       and the daily send cap that reads from it.
--   letting_agents      the agents module. Also fetched on every cold start
--                       and every re-sync, erroring each time.
--   push_subscriptions  phone push notifications.
--
-- SAFE TO RE-RUN: every statement is `if not exists`, and the policies are
-- created only when absent. Nothing here touches existing data.
-- ============================================================================

-- 1. tasks --------------------------------------------------------------
create table if not exists tasks (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists tasks_updated_idx on tasks (updated_at desc);
alter table tasks enable row level security;

-- 2. letting_agents -----------------------------------------------------
create table if not exists letting_agents (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists letting_agents_updated_idx on letting_agents (updated_at desc);
alter table letting_agents enable row level security;

-- 3. email_sends --------------------------------------------------------
create table if not exists email_sends (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text,
  prospect_id text,
  campaign_label text,
  message_id text,
  data jsonb,
  sent_at timestamptz not null default now()
);
create index if not exists email_sends_to_email_idx on email_sends (lower(to_email));
create index if not exists email_sends_sent_at_idx on email_sends (sent_at desc);
create index if not exists email_sends_prospect_idx on email_sends (prospect_id);
alter table email_sends enable row level security;

-- 4. email_queue --------------------------------------------------------
create table if not exists email_queue (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text,
  body text,
  prospect_id text,
  campaign_label text,
  status text not null default 'pending',
  scheduled_for timestamptz not null default now(),
  attempts int not null default 0,
  last_error text,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_queue_due_idx on email_queue (status, scheduled_for);
create index if not exists email_queue_prospect_idx on email_queue (prospect_id);
create index if not exists email_queue_status_idx on email_queue (status);
alter table email_queue enable row level security;

-- 5. push_subscriptions -------------------------------------------------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;

-- Policies. Created only when absent, so re-running is a no-op.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'tasks' and policyname = 'auth all tasks') then
    create policy "auth all tasks" on tasks for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'letting_agents' and policyname = 'auth all letting_agents') then
    create policy "auth all letting_agents" on letting_agents for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'email_sends' and policyname = 'auth all email_sends') then
    create policy "auth all email_sends" on email_sends for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'email_queue' and policyname = 'auth all email_queue') then
    create policy "auth all email_queue" on email_queue for all to authenticated using (true) with check (true);
  end if;
  -- Push subscriptions stay per-user: a device token is personal, and one
  -- person's phone must never receive another person's notifications.
  if not exists (select 1 from pg_policies where tablename = 'push_subscriptions' and policyname = 'own push subscriptions') then
    create policy "own push subscriptions" on push_subscriptions for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- Check: all five should be listed.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('tasks', 'letting_agents', 'email_sends', 'email_queue', 'push_subscriptions')
order by table_name;
