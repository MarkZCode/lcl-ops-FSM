-- ============================================================================
-- LCL Ops — turn on live sync. Run once, in Supabase → SQL Editor.
-- ============================================================================
--
-- STATUS: AS OF 22 SEP 2026 THIS HAS NOT BEEN RUN. Verified directly against
-- the live database: a client subscribes successfully and then receives
-- nothing, because none of these tables are in the publication. This is the
-- whole reason a job booked on the desktop can take until the next re-sync to
-- appear on the phone. Run it once and that becomes about a second.
--
-- WHAT THIS DOES
-- The app subscribes to changes on `jobs`, `clients`, `engineers` and
-- `app_settings` (which holds expenses and engineer payments), so a job booked
-- or completed on one device appears on every other device in about a second.
-- Postgres only broadcasts changes for tables that are in the `supabase_realtime`
-- publication, so until this runs the subscription connects and then sits
-- silent — the app keeps working, it just falls back to refreshing on focus.
--
-- SAFE TO RE-RUN. Adding a table that's already in the publication is a no-op
-- here because we check first.
-- ============================================================================

-- REPLICA IDENTITY FULL makes the OLD row available on UPDATE/DELETE events.
-- Without it a delete arrives with only the primary key, which is enough for
-- this app (it keys on id) but not for anything that needs the previous values.
alter table public.jobs         replica identity full;
alter table public.clients      replica identity full;
alter table public.engineers    replica identity full;
alter table public.app_settings replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clients'
  ) then
    alter publication supabase_realtime add table public.clients;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'engineers'
  ) then
    alter publication supabase_realtime add table public.engineers;
  end if;

  -- Expenses and engineer payments live here, one row each. They are the
  -- figures that make a profit number wrong when they're stale, so they
  -- belong on the live channel too.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
end $$;

-- Check it worked — jobs, clients, engineers and app_settings should all be listed.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
