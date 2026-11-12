-- Security hardening for DK Central Cloud System.
-- Review and apply only after confirming the production project and testing the portal.
-- This migration intentionally disables unauthenticated anonymous submissions/uploads.
begin;
revoke insert on table public.public_submissions from anon;
grant insert on table public.public_submissions to authenticated;
drop policy if exists public_submit_insert on public.public_submissions;
drop policy if exists public_submit_authenticated_insert on public.public_submissions;
create policy public_submit_authenticated_insert on public.public_submissions for insert to authenticated with check (true);
drop policy if exists dk_public_files_insert on storage.objects;
drop policy if exists dk_public_files_authenticated_insert on storage.objects;
create policy dk_public_files_authenticated_insert on storage.objects for insert to authenticated
with check (bucket_id='dk-public-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.create_admin_notification() from public, anon, authenticated;
commit;
