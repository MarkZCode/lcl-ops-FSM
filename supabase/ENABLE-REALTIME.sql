-- ============================================================================
-- LCL Ops — turn on live sync. Run once, in Supabase → SQL Editor.
-- ============================================================================
--
-- WHAT THIS DOES
-- The app now subscribes to changes on `jobs` and `clients`, so a job booked
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
alter table public.jobs    replica identity full;
alter table public.clients replica identity full;

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
end $$;

-- Check it worked — both tables should be listed.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
