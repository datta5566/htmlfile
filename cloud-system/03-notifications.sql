create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_code text not null,
  device_id text not null,
  storage_key text not null,
  record_hash text not null,
  record_index integer,
  record_data jsonb not null default '{}'::jsonb,
  notify_admin boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, app_code, device_id, storage_key, record_hash)
);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.app_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_code text not null,
  title text not null,
  message text not null,
  record_data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_events_created_idx on public.app_events(created_at desc);
create index if not exists admin_notifications_created_idx on public.admin_notifications(created_at desc);
create index if not exists admin_notifications_unread_idx on public.admin_notifications(is_read,created_at desc);

create or replace function public.event_summary(data jsonb)
returns text language sql immutable as $$
  select coalesce(
    nullif(data->>'complaintNo',''), nullif(data->>'employeeName',''),
    nullif(data->>'REPORTED BY ',''), nullif(data->>'ideaBy',''),
    nullif(data->>'barcode',''), nullif(data->>'Part Barcode',''),
    nullif(data->>'partName',''), nullif(data->>'OBSERVATION FOUND',''),
    nullif(data->>'rejection',''), nullif(data->>'unit',''),
    nullif(data->>'kn',''), 'New record submitted'
  );
$$;

create or replace function public.create_admin_notification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.notify_admin then
    insert into public.admin_notifications(event_id,user_id,app_code,title,message,record_data)
    values(new.id,new.user_id,new.app_code,'New ' || new.app_code || ' record',public.event_summary(new.record_data),new.record_data)
    on conflict(event_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_app_event_created on public.app_events;
create trigger on_app_event_created
after insert on public.app_events
for each row execute function public.create_admin_notification();

grant select,insert on public.app_events to authenticated;
grant select,update on public.admin_notifications to authenticated;

alter table public.app_events enable row level security;
alter table public.admin_notifications enable row level security;

drop policy if exists app_events_read on public.app_events;
create policy app_events_read on public.app_events for select to authenticated
using(user_id=auth.uid() or public.is_admin());

drop policy if exists app_events_insert on public.app_events;
create policy app_events_insert on public.app_events for insert to authenticated
with check(user_id=auth.uid());

drop policy if exists notifications_admin_read on public.admin_notifications;
create policy notifications_admin_read on public.admin_notifications for select to authenticated
using(public.is_admin());

drop policy if exists notifications_admin_update on public.admin_notifications;
create policy notifications_admin_update on public.admin_notifications for update to authenticated
using(public.is_admin()) with check(public.is_admin());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='admin_notifications'
  ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end $$;
