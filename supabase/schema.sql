-- ============================================================================
-- LCL Ops — Supabase schema (Phase 1: shared data)
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- ============================================================================

-- Each entity is stored as one row with a JSONB `data` payload, mirroring the
-- objects the app already uses. The app loads everything into memory and filters
-- client-side, so this keeps the migration simple and the component code unchanged.

create table if not exists clients (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists engineers (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists prospects (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists letting_agents (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists engineer_recruits (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Single-row table for app-wide settings (email, templates, service prices,
-- invoice counter, document templates, company documents).
create table if not exists app_settings (
  id text primary key default 'singleton',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- PHASE 1 (internal tool, behind the app login): allow the anon key full access
-- so the office can read/write shared data. ⚠️ This is NOT secure for public
-- exposure — Phase 2 replaces this with real Supabase Auth + per-user policies.
-- ----------------------------------------------------------------------------
alter table clients      enable row level security;
alter table jobs         enable row level security;
alter table engineers    enable row level security;
alter table prospects    enable row level security;
alter table leads        enable row level security;
alter table letting_agents enable row level security;
alter table engineer_recruits enable row level security;
alter table app_settings enable row level security;

create policy "anon all clients"      on clients      for all using (true) with check (true);
create policy "anon all jobs"         on jobs         for all using (true) with check (true);
create policy "anon all engineers"    on engineers    for all using (true) with check (true);
create policy "anon all prospects"    on prospects    for all using (true) with check (true);
create policy "anon all leads"        on leads        for all using (true) with check (true);
create policy "anon all letting_agents" on letting_agents for all using (true) with check (true);
create policy "anon all engineer_recruits" on engineer_recruits for all using (true) with check (true);
create policy "anon all app_settings" on app_settings for all using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Storage bucket for job files (certificates, payment proofs, photos)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('job-files', 'job-files', true)
on conflict (id) do nothing;

create policy "anon read job-files"   on storage.objects for select using (bucket_id = 'job-files');
create policy "anon write job-files"  on storage.objects for insert with check (bucket_id = 'job-files');
create policy "anon update job-files" on storage.objects for update using (bucket_id = 'job-files');
create policy "anon delete job-files" on storage.objects for delete using (bucket_id = 'job-files');
