-- Cold Leads table — scraped/prospected contacts with no prior relationship.
-- Run this in the Supabase SQL editor before using the Cold Leads module.

create table if not exists cold_leads (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table cold_leads enable row level security;

create policy "auth all cold_leads" on cold_leads
  for all to authenticated using (true) with check (true);

create index if not exists cold_leads_updated_idx on cold_leads (updated_at desc);
