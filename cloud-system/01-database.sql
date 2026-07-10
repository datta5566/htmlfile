create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_code text not null,
  device_id text not null,
  storage_key text not null,
  source_url text,
  payload jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, app_code, device_id, storage_key)
);

create index if not exists app_snapshots_user_idx on public.app_snapshots(user_id);
create index if not exists app_snapshots_app_idx on public.app_snapshots(app_code);
create index if not exists app_snapshots_updated_idx on public.app_snapshots(updated_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,display_name)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',split_part(coalesce(new.email,''),'@',1)))
  on conflict(id) do update set email=excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles(id,email,display_name)
select id,email,split_part(coalesce(email,''),'@',1) from auth.users
on conflict(id) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

grant execute on function public.is_admin() to authenticated;
grant select on public.profiles to authenticated;
grant select,insert,update,delete on public.app_snapshots to authenticated;

alter table public.profiles enable row level security;
alter table public.app_snapshots enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using(id=auth.uid() or public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
using(public.is_admin()) with check(public.is_admin());

drop policy if exists snapshots_read on public.app_snapshots;
create policy snapshots_read on public.app_snapshots for select to authenticated
using(user_id=auth.uid() or public.is_admin());

drop policy if exists snapshots_insert on public.app_snapshots;
create policy snapshots_insert on public.app_snapshots for insert to authenticated
with check(user_id=auth.uid());

drop policy if exists snapshots_update on public.app_snapshots;
create policy snapshots_update on public.app_snapshots for update to authenticated
using(user_id=auth.uid() or public.is_admin())
with check(user_id=auth.uid() or public.is_admin());

drop policy if exists snapshots_delete on public.app_snapshots;
create policy snapshots_delete on public.app_snapshots for delete to authenticated
using(user_id=auth.uid() or public.is_admin());

-- After owner signup, replace the email and run once:
-- update public.profiles set role='admin' where email='owner@example.com';
