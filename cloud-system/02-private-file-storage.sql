insert into storage.buckets(id,name,public,file_size_limit)
values('dk-app-files','dk-app-files',false,52428800)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

drop policy if exists dk_files_read on storage.objects;
create policy dk_files_read on storage.objects for select to authenticated
using(
  bucket_id='dk-app-files'
  and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);

drop policy if exists dk_files_insert on storage.objects;
create policy dk_files_insert on storage.objects for insert to authenticated
with check(
  bucket_id='dk-app-files'
  and (storage.foldername(name))[1]=auth.uid()::text
);

drop policy if exists dk_files_update on storage.objects;
create policy dk_files_update on storage.objects for update to authenticated
using(
  bucket_id='dk-app-files'
  and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
)
with check(
  bucket_id='dk-app-files'
  and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);

drop policy if exists dk_files_delete on storage.objects;
create policy dk_files_delete on storage.objects for delete to authenticated
using(
  bucket_id='dk-app-files'
  and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin())
);
