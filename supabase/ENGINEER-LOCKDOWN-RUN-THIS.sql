-- ============================================================================
-- LCL Ops — ENGINEER LOGINS CANNOT READ THE DATABASE.  Run this once.
-- Supabase → SQL Editor → New query → paste the whole file → Run.
-- ============================================================================
--
-- WHAT THIS DOES
-- --------------
-- Until now, any signed-in account could read and write every table — the
-- app decided what each role SAW, but the database itself would hand an
-- engineer's login the whole client list, every job and price, and every
-- other engineer's pay details if asked directly.
--
-- This adds one rule to each table: an account whose role is "engineer" is
-- refused. Engineers now get their own jobs and pay from the server
-- (/api/portal), which sends only what belongs to them.
--
-- WILL THIS BREAK THE APP?  No.
--   • Admins and agents are unaffected: the rule only excludes "engineer".
--   • It is a RESTRICTIVE policy, so it narrows the existing "signed-in users"
--     policy rather than replacing it. Nothing else is dropped or changed.
--   • Server routes and crons use the service-role key and bypass these rules.
--   • The engineer portal (from build v151) no longer reads tables at all.
--
-- Safe to run more than once.
-- ============================================================================

do $$
declare
  t text;
  rls boolean;
begin
  foreach t in array array[
    'clients', 'jobs', 'engineers', 'app_settings', 'tasks',
    'prospects', 'leads', 'cold_leads', 'letting_agents', 'engineer_recruits',
    'email_queue', 'email_sends'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipped %: table does not exist', t;
      continue;
    end if;
    select relrowsecurity into rls from pg_class where oid = to_regclass('public.' || t);
    if not rls then
      -- Not switched on here: turning RLS on for a table with no other policy
      -- would lock everyone out. Run supabase/LOCKDOWN-RUN-THIS.sql first.
      raise notice 'WARNING %: row level security is OFF on this table — run LOCKDOWN-RUN-THIS.sql, then this file again', t;
      continue;
    end if;
    execute format('drop policy if exists "no engineer logins" on public.%I', t);
    execute format(
      'create policy "no engineer logins" on public.%I as restrictive for all to authenticated '
      || 'using (coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') <> ''engineer'') '
      || 'with check (coalesce(auth.jwt() -> ''app_metadata'' ->> ''role'', '''') <> ''engineer'')',
      t
    );
    raise notice 'ok %: engineer logins refused', t;
  end loop;
end $$;

-- Uploaded files: an engineer's login may not write to or delete from the
-- bucket directly either (they upload certificates through their job link,
-- which goes through the server).
drop policy if exists "no engineer file writes"  on storage.objects;
drop policy if exists "no engineer file changes" on storage.objects;
drop policy if exists "no engineer file deletes" on storage.objects;
create policy "no engineer file writes"  on storage.objects as restrictive for insert to authenticated
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'engineer');
create policy "no engineer file changes" on storage.objects as restrictive for update to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'engineer');
create policy "no engineer file deletes" on storage.objects as restrictive for delete to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'engineer');

-- TO CHECK IT WORKED: the "Messages" tab under the query should list
-- "ok <table>: engineer logins refused" for each table. Any line starting
-- WARNING means that table still needs LOCKDOWN-RUN-THIS.sql.
--
-- ALSO CHECK (Supabase dashboard → Authentication → Providers → Email):
-- "Allow new users to sign up" must be OFF, so nobody can create their own
-- account. Accounts are made by an admin in Settings → Users.
