-- CAREMESH FRESH SETUP RESET
-- Use ONLY when setting up a new/empty Supabase project or when you are sure
-- the CareMesh schema contains no production data you need to keep.
-- This removes CareMesh application tables, helper functions, policies,
-- custom enum types and the private CareMesh storage bucket so the main
-- migration can be run cleanly from scratch.

begin;

-- Storage policies reference CareMesh functions/tables, so remove the bucket
-- after dropping application objects and functions.

-- Application tables
 drop table if exists public.reports cascade;
 drop table if exists public.audit_log cascade;
 drop table if exists public.care_gaps cascade;
 drop table if exists public.notifications cascade;
 drop table if exists public.appointments cascade;
 drop table if exists public.documents cascade;
 drop table if exists public.care_events cascade;
 drop table if exists public.patients cascade;
 drop table if exists public.organization_memberships cascade;
 drop table if exists public.profiles cascade;
 drop table if exists public.organizations cascade;

-- Auth triggers owned by CareMesh. Dropping the trigger is enough; the
-- Supabase auth.users table itself is never dropped.
drop trigger if exists on_auth_user_created on auth.users;

-- CareMesh helper/trigger functions
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_updated_at() cascade;
drop function if exists public.is_org_member(uuid) cascade;
drop function if exists public.is_org_admin(uuid) cascade;
drop function if exists public.current_patient_id() cascade;
drop function if exists public.can_access_patient(uuid) cascade;
drop function if exists public.link_patient_account(text) cascade;

-- Remove CareMesh custom enum types.
drop type if exists public.gap_status cascade;
drop type if exists public.gap_severity cascade;
drop type if exists public.appointment_status cascade;
drop type if exists public.document_status cascade;
drop type if exists public.document_source cascade;
drop type if exists public.event_status cascade;
drop type if exists public.event_type cascade;
drop type if exists public.member_role cascade;

-- Remove the CareMesh private storage bucket and all objects in it.
-- Deleting from storage.objects first avoids FK/dependency problems.
delete from storage.objects where bucket_id = 'caremesh-documents';
delete from storage.buckets where id = 'caremesh-documents';

commit;

select 'CareMesh schema reset complete. Now run supabase/migrations/001_caremesh.sql' as status;
