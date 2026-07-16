create table if not exists public.public_submissions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null check (char_length(device_id) between 8 and 100),
  display_name text not null default 'User' check (char_length(display_name) between 1 and 120),
  app_code text not null check (app_code in ('ua_uc','kaizen','rejection','file_store')),
  storage_key text not null check (char_length(storage_key) between 1 and 160),
  record_hash text not null check (record_hash ~ '^[a-f0-9]{64}$'),
  record_data jsonb not null default '{}'::jsonb check (octet_length(record_data::text) <= 1048576),
  source_url text,
  client_created_at timestamptz,
  created_at timestamptz not null default now(),
  unique(device_id,app_code,storage_key,record_hash)
);

create index if not exists public_submissions_created_idx on public.public_submissions(created_at desc);
create index if not exists public_submissions_app_idx on public.public_submissions(app_code);
create index if not exists public_submissions_device_idx on public.public_submissions(device_id);

grant insert on public.public_submissions to anon,authenticated;
grant select,delete on public.public_submissions to authenticated;
alter table public.public_submissions enable row level security;

drop policy if exists public_submit_insert on public.public_submissions;
create policy public_submit_insert on public.public_submissions for insert to anon,authenticated with check (true);
drop policy if exists public_submit_admin_read on public.public_submissions;
create policy public_submit_admin_read on public.public_submissions for select to authenticated using (public.is_admin());
drop policy if exists public_submit_admin_delete on public.public_submissions;
create policy public_submit_admin_delete on public.public_submissions for delete to authenticated using (public.is_admin());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='public_submissions') then
    alter publication supabase_realtime add table public.public_submissions;
  end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit)
values('dk-public-files','dk-public-files',false,10485760)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

drop policy if exists dk_public_files_insert on storage.objects;
create policy dk_public_files_insert on storage.objects for insert to anon,authenticated
with check(bucket_id='dk-public-files');
drop policy if exists dk_public_files_admin_read on storage.objects;
create policy dk_public_files_admin_read on storage.objects for select to authenticated
using(bucket_id='dk-public-files' and public.is_admin());
drop policy if exists dk_public_files_admin_delete on storage.objects;
create policy dk_public_files_admin_delete on storage.objects for delete to authenticated
using(bucket_id='dk-public-files' and public.is_admin());
