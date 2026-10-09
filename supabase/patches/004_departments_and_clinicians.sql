-- CareMesh: organization-scoped departments and clinician directory
-- Safe additive migration. Does not modify patients, events, appointments or reports.

begin;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_org_name_unique unique (org_id, name)
);

create unique index if not exists departments_org_name_lower_unique
  on public.departments (org_id, lower(name));
create index if not exists departments_org_active_name_idx
  on public.departments (org_id, is_active, name);

create table if not exists public.clinicians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  title text,
  specialty text,
  email text,
  mobile text,
  department_id uuid references public.departments(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clinicians_org_email_lower_unique
  on public.clinicians (org_id, lower(email)) where email is not null and email <> '';
create index if not exists clinicians_org_active_name_idx
  on public.clinicians (org_id, is_active, full_name);
create index if not exists clinicians_department_idx
  on public.clinicians (department_id);

create or replace function public.is_org_owner_admin(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and om.role = 'ADMIN'
  );
$$;

grant execute on function public.is_org_owner_admin(uuid) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.departments to authenticated;
grant select, insert, update on public.clinicians to authenticated;
grant select, insert, update, delete on public.departments to service_role;
grant select, insert, update, delete on public.clinicians to service_role;

alter table public.departments enable row level security;
alter table public.clinicians enable row level security;

drop policy if exists departments_select_org_members on public.departments;
drop policy if exists departments_insert_admin on public.departments;
drop policy if exists departments_update_admin on public.departments;
create policy departments_select_org_members
  on public.departments for select to authenticated
  using (public.is_org_member(org_id));
create policy departments_insert_admin
  on public.departments for insert to authenticated
  with check (public.is_org_owner_admin(org_id) and created_by = auth.uid());
create policy departments_update_admin
  on public.departments for update to authenticated
  using (public.is_org_owner_admin(org_id))
  with check (public.is_org_owner_admin(org_id));

drop policy if exists clinicians_select_org_members on public.clinicians;
drop policy if exists clinicians_insert_admin on public.clinicians;
drop policy if exists clinicians_update_admin on public.clinicians;
create policy clinicians_select_org_members
  on public.clinicians for select to authenticated
  using (public.is_org_member(org_id));
create policy clinicians_insert_admin
  on public.clinicians for insert to authenticated
  with check (
    public.is_org_owner_admin(org_id)
    and created_by = auth.uid()
    and (department_id is null or exists (
      select 1 from public.departments d
      where d.id = department_id and d.org_id = public.clinicians.org_id
    ))
  );
create policy clinicians_update_admin
  on public.clinicians for update to authenticated
  using (public.is_org_owner_admin(org_id))
  with check (
    public.is_org_owner_admin(org_id)
    and (department_id is null or exists (
      select 1 from public.departments d
      where d.id = department_id and d.org_id = public.clinicians.org_id
    ))
  );

drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at before update on public.departments
  for each row execute function public.handle_updated_at();
drop trigger if exists clinicians_updated_at on public.clinicians;
create trigger clinicians_updated_at before update on public.clinicians
  for each row execute function public.handle_updated_at();

commit;

select 'departments' as table_name, count(*) as existing_records from public.departments
union all
select 'clinicians', count(*) from public.clinicians;
