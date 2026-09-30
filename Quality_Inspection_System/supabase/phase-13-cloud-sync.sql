-- Phase 13 — Cloud Sync Foundation
-- Run this in the Supabase SQL Editor for the project used by Quality Inspection System.
-- Phase 14 will add authenticated users / roles. This phase keeps the schema ready for that upgrade.
create table if not exists public.quality_inspections (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists quality_inspections_updated_at_idx
  on public.quality_inspections(updated_at desc);

alter table public.quality_inspections enable row level security;

-- IMPORTANT:
-- Do not create an unrestricted anon policy for production data.
-- Phase 13 intentionally leaves access policies to the authenticated setup
-- that will be introduced in Phase 14.
-- Until then, Cloud Sync will correctly report an authorization error if
-- the table has no permitted policy.

comment on table public.quality_inspections is
'Quality Inspection System Phase 13 cloud sync records; one row per Inspection ID.';
