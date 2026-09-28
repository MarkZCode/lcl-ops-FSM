-- ============================================================================
-- LCL Ops — remove duplicate engineer rows, stop them recurring, and make
-- tasks update live.  Run in the LIVE project (xtugdazykhpbblqawnym).
-- Safe to re-run.
-- ============================================================================
--
-- Supersedes DEDUPE-AND-FIX-PRIMARY-KEYS.sql, which picked the copy to keep by
-- the `updated_at` column. On the live data that column is EMPTY on every
-- newer copy and only set on the OLDEST one, so that script deleted nothing
-- and then failed adding the key. The real edit time is `data->>'updatedAt'`
-- (ISO text, so it sorts correctly as text — no casting that could fail).

-- 0. Backup first. If anything looks wrong afterwards, the originals are here.
create table if not exists public.engineers_backup_20260926 as table public.engineers;
create table if not exists public.engineer_recruits_backup_20260926 as table public.engineer_recruits;

-- 1. Engineers: keep the most recently EDITED copy of each id.
with ranked as (
  select ctid,
         row_number() over (
           partition by id
           order by data->>'updatedAt' desc nulls last,
                    updated_at desc nulls last,
                    ctid desc
         ) as rn
  from public.engineers
)
delete from public.engineers e
using ranked r
where e.ctid = r.ctid and r.rn > 1;

-- 2. Recruits: same rule (no duplicates seen, but same missing key).
with ranked as (
  select ctid,
         row_number() over (
           partition by id
           order by data->>'updatedAt' desc nulls last,
                    updated_at desc nulls last,
                    ctid desc
         ) as rn
  from public.engineer_recruits
)
delete from public.engineer_recruits e
using ranked r
where e.ctid = r.ctid and r.rn > 1;

-- 3. The primary key that should always have been there — without it every
--    save INSERTS a new copy instead of replacing the old one.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.engineers'::regclass and contype = 'p') then
    alter table public.engineers add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.engineer_recruits'::regclass and contype = 'p') then
    alter table public.engineer_recruits add primary key (id);
  end if;
end $$;

-- 4. Tasks update live on every device (like jobs already do).
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;
end $$;

-- 5. Check. Expect: engineers 6 rows / 6 distinct, recruits equal counts,
--    two PRIMARY KEY rows, and `tasks` listed in the publication.
select 'engineers' as table_name, count(*) as rows, count(distinct id) as distinct_ids from public.engineers
union all
select 'engineer_recruits', count(*), count(distinct id) from public.engineer_recruits;

select conrelid::regclass as table_name, conname
from pg_constraint
where conrelid in ('public.engineers'::regclass, 'public.engineer_recruits'::regclass)
  and contype = 'p';

select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'tasks';
