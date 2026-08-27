-- ============================================================================
-- LCL Ops — CLOSE THE OPEN DATABASE.  Run this once, now.
-- Supabase → SQL Editor → New query → paste the whole file → Run.
-- ============================================================================
--
-- WHY THIS IS URGENT
-- ------------------
-- Every table is currently governed by a policy of the form
--     for all using (true) with check (true)
-- which grants full READ AND WRITE to the *anon* role. The anon key is not a
-- secret: it is compiled into the public JavaScript bundle (NEXT_PUBLIC_...),
-- so anyone who loads the site can copy it out of devtools and then, WITHOUT
-- LOGGING IN, read or modify:
--
--     clients            37 rows   names, phones, emails, addresses
--     jobs               25 rows   prices, margins, access phone numbers
--     engineers           4 rows   pay rates AND bank sort code / account no.
--     app_settings        6 rows   email/SMTP configuration
--     prospects      14,567 rows   landlord names, phones, addresses
--     leads          42,471 rows   agency contact details
--     engineer_recruits 1,231 rows
--
-- Verified against the live project: all eight tables returned data to the
-- anon key with no session, and a delete issued as anon was accepted.
--
-- supabase/auth-security.sql was written to fix this but (a) appears never to
-- have been run, and (b) only covered clients / jobs / engineers /
-- app_settings — it left prospects, leads, letting_agents and
-- engineer_recruits open even if it had been. This file covers all of them.
--
-- WILL THIS BREAK THE APP?  No.
--   • The app reads and writes as a LOGGED-IN user  -> matches `to authenticated`.
--   • Server routes and cron use the service-role key -> bypass RLS entirely.
--   • The public /share/<token> page no longer touches Supabase from the
--     browser; it goes through /api/share/<token>, which runs server-side on
--     the service-role key. That was the only anonymous reader, and it was
--     changed in the same release as this file.
-- ============================================================================

-- 1. Drop every permissive anon policy -------------------------------------
drop policy if exists "anon all clients"            on clients;
drop policy if exists "anon all jobs"               on jobs;
drop policy if exists "anon all engineers"          on engineers;
drop policy if exists "anon all app_settings"       on app_settings;
drop policy if exists "anon all prospects"          on prospects;
drop policy if exists "anon all leads"              on leads;
drop policy if exists "anon all letting_agents"     on letting_agents;
drop policy if exists "anon all engineer_recruits"  on engineer_recruits;

-- Older/duplicate names from earlier runs, harmless if absent.
drop policy if exists "authed clients"      on clients;
drop policy if exists "authed jobs"         on jobs;
drop policy if exists "authed engineers"    on engineers;
drop policy if exists "authed app_settings" on app_settings;

-- 2. Make sure RLS is actually ON (a table with RLS off ignores policies) ---
alter table clients            enable row level security;
alter table jobs               enable row level security;
alter table engineers          enable row level security;
alter table app_settings       enable row level security;
alter table prospects          enable row level security;
alter table leads              enable row level security;
alter table letting_agents     enable row level security;
alter table engineer_recruits  enable row level security;

-- 3. Re-grant to signed-in users only --------------------------------------
create policy "authed clients"           on clients           for all to authenticated using (true) with check (true);
create policy "authed jobs"              on jobs              for all to authenticated using (true) with check (true);
create policy "authed engineers"         on engineers         for all to authenticated using (true) with check (true);
create policy "authed app_settings"      on app_settings      for all to authenticated using (true) with check (true);
create policy "authed prospects"         on prospects         for all to authenticated using (true) with check (true);
create policy "authed leads"             on leads             for all to authenticated using (true) with check (true);
create policy "authed letting_agents"    on letting_agents    for all to authenticated using (true) with check (true);
create policy "authed engineer_recruits" on engineer_recruits for all to authenticated using (true) with check (true);

-- 4. Storage: job-files is a PUBLIC bucket, so uploaded certificates and
--    avatars are readable by URL. Keep reads public (emailed certificate
--    links depend on it) but stop anonymous WRITES — otherwise anyone can
--    upload into your bucket.
drop policy if exists "anon write job-files"  on storage.objects;
drop policy if exists "anon update job-files" on storage.objects;
drop policy if exists "anon delete job-files" on storage.objects;
create policy "authed write job-files"  on storage.objects for insert to authenticated with check (bucket_id = 'job-files');
create policy "authed update job-files" on storage.objects for update to authenticated using  (bucket_id = 'job-files');
create policy "authed delete job-files" on storage.objects for delete to authenticated using  (bucket_id = 'job-files');

-- 5. AFTER RUNNING, in the Supabase dashboard:
--    Authentication → Providers → Email → turn OFF "Allow new users to sign up".
--    Otherwise anyone can create their own account and authenticate past the
--    policies above. Accounts are created by an admin from Settings.

-- 6. Check it worked — this must return 0 rows for the anon role:
--    (or just reload the app; it should still work normally when logged in)
select tablename, policyname, roles
from pg_policies
where schemaname = 'public'
  and 'anon' = any (roles);
