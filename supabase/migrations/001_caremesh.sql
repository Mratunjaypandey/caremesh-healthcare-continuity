-- CareMesh production schema
-- Designed around the project proposal: organization-scoped admin access,
-- patient-scoped access, longitudinal events, documents, appointments,
-- notifications, care gaps, reports and audit history.

create extension if not exists pgcrypto;

create type public.member_role as enum ('ADMIN', 'CLINICIAN', 'PATIENT');
create type public.event_type as enum ('OPD', 'ADMISSION', 'LAB', 'FOLLOW_UP', 'APPOINTMENT', 'BILLING', 'DOCUMENT', 'PATIENT_NOTE');
create type public.event_status as enum ('PLANNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FINAL', 'CANCELLED', 'PENDING', 'RESCHEDULED');
create type public.document_source as enum ('ADMIN', 'PATIENT');
create type public.document_status as enum ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'FINAL');
create type public.appointment_status as enum ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW');
create type public.gap_severity as enum ('LOW', 'MEDIUM', 'HIGH');
create type public.gap_status as enum ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  mobile text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  status text not null default 'active' check (status in ('active','suspended','invited')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  patient_code text not null unique,
  full_name text not null,
  gender text not null check (gender in ('Male','Female','Other','Prefer not to say')),
  dob date not null,
  mobile text not null,
  email text,
  address text,
  emergency_contact text,
  consent_recorded boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, mobile)
);

create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  event_type public.event_type not null,
  event_status public.event_status,
  event_date date not null,
  event_time time,
  department text,
  clinician text,
  title text not null,
  summary text,
  prescription text,
  next_follow_up date,
  metadata jsonb not null default '{}'::jsonb,
  author_id uuid references auth.users(id) on delete set null,
  author_role public.member_role not null,
  source_label text not null default 'CareMesh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  document_type text not null,
  source_role public.document_source not null,
  author_id uuid references auth.users(id) on delete set null,
  status public.document_status not null default 'SUBMITTED',
  linked_event_id uuid references public.care_events(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_date date not null,
  appointment_time time not null,
  department text not null,
  clinician text not null,
  status public.appointment_status not null default 'SCHEDULED',
  reason text not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  message text not null,
  kind text not null default 'INFO',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.care_gaps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  gap_type text not null,
  severity public.gap_severity not null,
  description text not null,
  source_event_ids uuid[] not null default '{}',
  status public.gap_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create unique index care_gaps_open_unique on public.care_gaps(patient_id, gap_type) where status <> 'RESOLVED';

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role public.member_role,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  report_type text not null default 'AI_HISTORY',
  model text,
  content jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index patients_org_mobile_idx on public.patients(org_id, mobile);
create index patients_org_name_idx on public.patients(org_id, full_name);
create index care_events_patient_date_idx on public.care_events(patient_id, event_date desc, event_time desc);
create index documents_patient_created_idx on public.documents(patient_id, created_at desc);
create index appointments_patient_date_idx on public.appointments(patient_id, appointment_date, appointment_time);
create index notifications_patient_created_idx on public.notifications(patient_id, created_at desc);
create index audit_org_created_idx on public.audit_log(org_id, created_at desc);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.handle_updated_at();
create trigger patients_updated_at before update on public.patients for each row execute function public.handle_updated_at();
create trigger care_events_updated_at before update on public.care_events for each row execute function public.handle_updated_at();
create trigger appointments_updated_at before update on public.appointments for each row execute function public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  insert into public.profiles (id, full_name, email, mobile)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Security-definer helpers avoid policy recursion.
create or replace function public.is_org_member(p_org_id uuid)
returns boolean
security definer
stable
set search_path = public
language sql
as $$
  select exists (
    select 1 from public.organization_memberships om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
security definer
stable
set search_path = public
language sql
as $$
  select exists (
    select 1 from public.organization_memberships om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role in ('ADMIN','CLINICIAN')
  );
$$;

create or replace function public.current_patient_id()
returns uuid
security definer
stable
set search_path = public
language sql
as $$
  select p.id from public.patients p where p.auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.can_access_patient(p_patient_id uuid)
returns boolean
security definer
stable
set search_path = public
language sql
as $$
  select exists (
    select 1
    from public.patients p
    where p.id = p_patient_id
      and (
        public.is_org_admin(p.org_id)
        or p.auth_user_id = auth.uid()
      )
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.patients enable row level security;
alter table public.care_events enable row level security;
alter table public.documents enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;
alter table public.care_gaps enable row level security;
alter table public.audit_log enable row level security;
alter table public.reports enable row level security;

create policy organizations_select on public.organizations for select using (public.is_org_member(id));

create policy profiles_select_self_or_admin on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.organization_memberships om
    where om.user_id = auth.uid() and om.status = 'active' and om.role in ('ADMIN','CLINICIAN')
  )
);
create policy profiles_update_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_select_self on public.organization_memberships for select using (user_id = auth.uid());
create policy memberships_select_admin on public.organization_memberships for select using (public.is_org_admin(org_id));

create policy patients_select on public.patients for select using (public.can_access_patient(id));
create policy patients_insert_admin on public.patients for insert with check (public.is_org_admin(org_id));
create policy patients_update_admin on public.patients for update using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy events_select on public.care_events for select using (public.can_access_patient(patient_id));
create policy events_insert_admin_or_patient_note on public.care_events for insert with check (
  (public.is_org_admin(org_id) and author_id = auth.uid())
  or (
    event_type = 'PATIENT_NOTE'
    and author_id = auth.uid()
    and exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid())
  )
);
create policy events_update_admin on public.care_events for update using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy documents_select on public.documents for select using (public.can_access_patient(patient_id));
create policy documents_insert_admin_or_patient on public.documents for insert with check (
  (public.is_org_admin(org_id) and source_role = 'ADMIN' and author_id = auth.uid())
  or (
    source_role = 'PATIENT'
    and author_id = auth.uid()
    and exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid())
  )
);
create policy documents_update_admin on public.documents for update using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy appointments_select on public.appointments for select using (public.can_access_patient(patient_id));
create policy appointments_insert_admin on public.appointments for insert with check (public.is_org_admin(org_id) and created_by = auth.uid());
create policy appointments_update_admin on public.appointments for update using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy notifications_select_patient on public.notifications for select using (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));
create policy notifications_update_patient on public.notifications for update using (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid())) with check (exists (select 1 from public.patients p where p.id = patient_id and p.auth_user_id = auth.uid()));
create policy notifications_select_admin on public.notifications for select using (public.is_org_admin(org_id));
create policy notifications_insert_admin on public.notifications for insert with check (public.is_org_admin(org_id));

create policy care_gaps_select on public.care_gaps for select using (public.can_access_patient(patient_id));
create policy care_gaps_update_admin on public.care_gaps for update using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy care_gaps_insert_admin on public.care_gaps for insert with check (public.is_org_admin(org_id));
create policy care_gaps_delete_admin on public.care_gaps for delete using (public.is_org_admin(org_id));

create policy audit_select_admin on public.audit_log for select using (public.is_org_admin(org_id));
create policy audit_insert_admin on public.audit_log for insert with check (public.is_org_admin(org_id) and actor_id = auth.uid());

create policy reports_select on public.reports for select using (public.can_access_patient(patient_id));
create policy reports_insert on public.reports for insert with check (public.can_access_patient(patient_id) and created_by = auth.uid());

-- Private medical-document bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'caremesh-documents',
  'caremesh-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy caremesh_storage_select on storage.objects
for select using (
  bucket_id = 'caremesh-documents'
  and exists (
    select 1
    from public.documents d
    where d.storage_path = storage.objects.name
      and public.can_access_patient(d.patient_id)
  )
);

create policy caremesh_storage_insert on storage.objects
for insert with check (
  bucket_id = 'caremesh-documents'
  and (
    public.is_org_admin((select org_id from public.patients p where p.id = split_part(name, '/', 1)::uuid))
    or exists (
      select 1 from public.patients p
      where p.id = split_part(name, '/', 1)::uuid
        and p.auth_user_id = auth.uid()
    )
  )
);

create policy caremesh_storage_update_admin on storage.objects
for update using (
  bucket_id = 'caremesh-documents'
  and public.is_org_admin((select org_id from public.patients p where p.id = split_part(name, '/', 1)::uuid))
) with check (
  bucket_id = 'caremesh-documents'
  and public.is_org_admin((select org_id from public.patients p where p.id = split_part(name, '/', 1)::uuid))
);

create policy caremesh_storage_delete_admin on storage.objects
for delete using (
  bucket_id = 'caremesh-documents'
  and public.is_org_admin((select org_id from public.patients p where p.id = split_part(name, '/', 1)::uuid))
);

-- Explicit PostgREST role privileges. RLS remains the authorization boundary for anon/authenticated.
grant usage on schema public to anon, authenticated, service_role;

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

grant usage, select, update on all sequences in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select, update on sequences to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.is_org_admin(uuid) to authenticated, service_role;
grant execute on function public.current_patient_id() to authenticated, service_role;
grant execute on function public.can_access_patient(uuid) to authenticated, service_role;
grant execute on function public.link_patient_account(text) to authenticated, service_role;

-- Organizations are created by the real bootstrap command or an administrative provisioning flow.
-- No demo organization or demo users are inserted by this migration.

-- Patient self-linking: the account must control the same email stored by the organization.
create or replace function public.link_patient_account(p_mobile text)
returns uuid
security definer
set search_path = public
language plpgsql
as $$
declare
  linked_patient uuid;
  patient_org uuid;
  existing_org uuid;
  user_email text;
  metadata_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  user_email := lower(coalesce(auth.jwt() ->> 'email',''));
  metadata_name := coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', 'CareMesh User');

  select om.org_id into existing_org
  from public.organization_memberships om
  where om.user_id = auth.uid()
    and om.status = 'active'
  order by om.created_at
  limit 1;

  select id, org_id into linked_patient, patient_org
  from public.patients
  where mobile = regexp_replace(p_mobile, '[^0-9]', '', 'g')
    and lower(coalesce(email,'')) = user_email
    and auth_user_id is null
  limit 1;

  if linked_patient is null then
    return null;
  end if;

  if existing_org is not null and existing_org <> patient_org then
    return null;
  end if;

  update public.patients set auth_user_id = auth.uid(), updated_at = now() where id = linked_patient;
  insert into public.organization_memberships(org_id, user_id, role, status)
  values (patient_org, auth.uid(), 'PATIENT', 'active')
  on conflict (org_id, user_id) do update set role='PATIENT', status='active';

  update public.profiles
  set full_name = metadata_name, email = user_email, mobile = regexp_replace(p_mobile, '[^0-9]', '', 'g'), updated_at = now()
  where id = auth.uid();

  return linked_patient;
end;
$$;

grant execute on function public.link_patient_account(text) to authenticated;
