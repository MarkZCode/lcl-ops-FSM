-- ============================================================================
-- LCL Ops — turn on live sync. Run once, in Supabase → SQL Editor.
-- ============================================================================
--
-- WHAT THIS DOES
-- The app subscribes to changes on `jobs`, `clients`, `engineers`,
-- `app_settings` (which holds expenses and engineer payments) and `tasks`
-- (so a task assigned to someone reaches their bell at once), so a job booked
-- or completed on one device appears on every other device in about a second.
-- Postgres only broadcasts changes for tables in the `supabase_realtime`
-- publication, so until this runs the subscription connects and then sits
-- silent — the app keeps working, it just falls back to refreshing on focus.
--
-- SAFE TO RE-RUN, AND IT CANNOT HALF-APPLY.
-- A plain `alter publication ... add table` raises 42710 (duplicate_object)
-- for a table that's already a member. The SQL Editor runs a script as ONE
-- transaction, so that single error rolls back everything else in the file —
-- including the `replica identity` lines, which then silently never applied.
-- Each add is therefore wrapped in its own exception handler: an
-- already-present table is skipped and the rest still runs.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['jobs', 'clients', 'engineers', 'app_settings', 'tasks'] loop
    -- REPLICA IDENTITY FULL makes the OLD row available on UPDATE/DELETE.
    -- Without it a delete arrives with only the primary key.
    execute format('alter table public.%I replica identity full', t);

    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'added % to supabase_realtime', t;
    exception
      when duplicate_object then
        raise notice '% was already in supabase_realtime — skipped', t;
    end;
  end loop;
end $$;

-- Check it worked — all five should be listed.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
