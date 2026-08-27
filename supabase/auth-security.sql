-- ============================================================================
-- LCL Ops — Phase 2 security: lock the database to logged-in users only.
-- Run this in Supabase → SQL Editor AFTER the app's Supabase Auth is in place.
-- ============================================================================

-- Replace the permissive "anyone with the anon key" policies with ones that
-- require an authenticated session (a real logged-in user). After this, the
-- anon key alone can no longer read or write any data.

drop policy if exists "anon all clients"      on clients;
drop policy if exists "anon all jobs"         on jobs;
drop policy if exists "anon all engineers"    on engineers;
drop policy if exists "anon all app_settings" on app_settings;

create policy "authed clients"      on clients      for all to authenticated using (true) with check (true);
create policy "authed jobs"         on jobs         for all to authenticated using (true) with check (true);
create policy "authed engineers"    on engineers    for all to authenticated using (true) with check (true);
create policy "authed app_settings" on app_settings for all to authenticated using (true) with check (true);

-- Storage (if/when the job-files bucket is created): require auth there too.
drop policy if exists "anon read job-files"   on storage.objects;
drop policy if exists "anon write job-files"  on storage.objects;
drop policy if exists "anon update job-files" on storage.objects;
drop policy if exists "anon delete job-files" on storage.objects;

-- (Recreate authenticated-only storage policies later when files move to Storage.)

-- IMPORTANT: also turn OFF public sign-ups so randoms can't make accounts:
--   Dashboard → Authentication → Providers → Email → disable "Allow new users to sign up".
-- Users are created by an admin only.
