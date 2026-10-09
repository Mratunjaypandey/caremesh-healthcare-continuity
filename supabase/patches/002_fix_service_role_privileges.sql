-- CareMesh permission repair
-- Run this ONCE in Supabase SQL Editor when bootstrap:admin reports:
--   ERROR: permission denied for table organizations
--
-- This does not drop data. It only restores PostgREST role privileges.

begin;

-- Schema access
 grant usage on schema public to anon, authenticated, service_role;

-- Tables used by CareMesh. RLS still applies to anon/authenticated;
-- service_role bypasses RLS and is used only by server-side provisioning/scripts.
 grant select, insert, update, delete on table
   public.organizations,
   public.profiles,
   public.organization_memberships,
   public.patients,
   public.care_events,
   public.documents,
   public.appointments,
   public.notifications,
   public.care_gaps,
   public.audit_log,
   public.reports
 to service_role;

 grant select, insert, update, delete on table
   public.profiles,
   public.organization_memberships,
   public.patients,
   public.care_events,
   public.documents,
   public.appointments,
   public.notifications,
   public.care_gaps,
   public.audit_log,
   public.reports
 to authenticated;

 -- Public client should not be allowed to read application tables without auth.
 revoke all on table
   public.organizations,
   public.profiles,
   public.organization_memberships,
   public.patients,
   public.care_events,
   public.documents,
   public.appointments,
   public.notifications,
   public.care_gaps,
   public.audit_log,
   public.reports
 from anon;

 -- Sequence access for inserts where identity/defaults use sequences.
 grant usage, select, update on all sequences in schema public to service_role;
 grant usage, select on all sequences in schema public to authenticated;

 -- Keep future CareMesh tables consistent with the same access model.
 alter default privileges in schema public
   grant select, insert, update, delete on tables to service_role;
 alter default privileges in schema public
   grant usage, select, update on sequences to service_role;
 alter default privileges in schema public
   grant select, insert, update, delete on tables to authenticated;
 alter default privileges in schema public
   grant usage, select on sequences to authenticated;

 -- Explicit function execution for authenticated application requests.
 grant execute on function public.is_org_member(uuid) to authenticated, service_role;
 grant execute on function public.is_org_admin(uuid) to authenticated, service_role;
 grant execute on function public.current_patient_id() to authenticated, service_role;
 grant execute on function public.can_access_patient(uuid) to authenticated, service_role;
 grant execute on function public.link_patient_account(text) to authenticated, service_role;

commit;

select
  has_table_privilege('service_role', 'public.organizations', 'INSERT') as service_role_can_insert_organizations,
  has_table_privilege('service_role', 'public.profiles', 'SELECT') as service_role_can_select_profiles,
  has_table_privilege('service_role', 'public.profiles', 'UPDATE') as service_role_can_update_profiles;
