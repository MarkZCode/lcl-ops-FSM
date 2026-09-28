-- DO NOT RUN — superseded by FIX-DUPLICATES-AND-TASKS-LIVE.sql. This version
-- orders by `updated_at`, which is empty on the newer duplicates, so it
-- deletes nothing and then fails adding the key.
-- ============================================================================
-- LCL Ops — remove duplicate rows and add the missing primary keys.
-- Supabase → SQL Editor → New query → paste the whole file → Run.
-- ============================================================================
--
-- WHY THIS IS NEEDED
-- ------------------
-- `engineers` and `engineer_recruits` were created before this project's
-- schema.sql existed. `create table if not exists ... (id text primary key)`
-- is a no-op on a table that already exists, so the PRIMARY KEY it declares
-- was never actually applied — the live tables have no unique constraint on
-- `id` at all.
--
-- Every edit saves via `.upsert({ id, data })`. An upsert needs a unique
-- constraint to detect "this id already exists" — without one, Postgres has
-- no conflict target, so it silently falls back to a plain INSERT. The old
-- row is never touched or replaced; it's just left behind. Confirmed on live
-- data: one engineer's record had SEVEN physical rows sharing a single id,
-- each an older snapshot of their rates.
--
-- Which of those duplicates the app happens to display then depends on
-- whatever order Postgres returns them in — unspecified without an ORDER BY,
-- and free to differ between requests, connections and devices. That is
-- exactly why an edited rate showed correctly on one device and not another:
-- both were reading the same duplicate-riddled table and landing on
-- different physical rows.
--
-- WILL THIS BREAK THE APP?  No.
--   • For each id, this keeps the row with the latest `updated_at` (falling
--     back to the highest ctid — insertion order — if updated_at ties) and
--     deletes the rest. No engineer or recruit is deleted, only their stale
--     duplicate snapshots.
--   • Safe to re-run: once each id is unique, the dedupe step matches
--     nothing and the constraint step is skipped if already present.
-- ============================================================================

-- 1. Remove duplicates on `engineers`, keeping the most recently updated row
--    per id.
delete from public.engineers a
using public.engineers b
where a.id = b.id
  and (
    a.updated_at < b.updated_at
    or (a.updated_at = b.updated_at and a.ctid < b.ctid)
  );

-- 2. Remove duplicates on `engineer_recruits`, same rule.
delete from public.engineer_recruits a
using public.engineer_recruits b
where a.id = b.id
  and (
    a.updated_at < b.updated_at
    or (a.updated_at = b.updated_at and a.ctid < b.ctid)
  );

-- 3. Now that every id is unique, add the constraint that should have been
--    there from the start — so this cannot silently recur.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'engineers_pkey'
  ) then
    alter table public.engineers add primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'engineer_recruits_pkey'
  ) then
    alter table public.engineer_recruits add primary key (id);
  end if;
end $$;

-- 4. Check it worked — both counts should be equal (no duplicates left), and
--    both tables should now show a PRIMARY KEY.
select 'engineers' as table_name, count(*) as rows, count(distinct id) as distinct_ids from public.engineers
union all
select 'engineer_recruits', count(*), count(distinct id) from public.engineer_recruits;

select conrelid::regclass as table_name, conname, contype
from pg_constraint
where conrelid in ('public.engineers'::regclass, 'public.engineer_recruits'::regclass)
  and contype = 'p';
