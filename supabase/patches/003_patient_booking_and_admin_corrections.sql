-- CareMesh: patient appointment booking/reschedule + timeline synchronization
-- Run once on the existing Supabase project. Do NOT run the initial schema reset.

begin;

grant select, insert, update on public.appointments to authenticated;
grant select, insert, update on public.care_events to authenticated;

-- Patient booking permissions.
drop policy if exists appointments_insert_patient on public.appointments;
drop policy if exists appointments_update_patient on public.appointments;

create policy appointments_insert_patient
on public.appointments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.patients p
    where p.id = patient_id
      and p.auth_user_id = auth.uid()
      and p.org_id = public.appointments.org_id
  )
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy appointments_update_patient
on public.appointments
for update
to authenticated
using (
  exists (
    select 1
    from public.patients p
    where p.id = public.appointments.patient_id
      and p.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.patients p
    where p.id = public.appointments.patient_id
      and p.auth_user_id = auth.uid()
      and p.org_id = public.appointments.org_id
  )
  and updated_by = auth.uid()
);

-- Patient-created appointment events are permitted so the longitudinal
-- timeline stays synchronized with appointment activity.
drop policy if exists events_insert_admin_or_patient_note on public.care_events;

create policy events_insert_admin_or_patient_note
on public.care_events
for insert
to authenticated
with check (
  (public.is_org_admin(org_id) and author_id = auth.uid())
  or (
    event_type in ('PATIENT_NOTE','APPOINTMENT')
    and author_id = auth.uid()
    and exists (
      select 1
      from public.patients p
      where p.id = patient_id
        and p.auth_user_id = auth.uid()
    )
  )
);

-- Patients can update only their own appointment timeline event.
drop policy if exists events_update_patient_appointment on public.care_events;

create policy events_update_patient_appointment
on public.care_events
for update
to authenticated
using (
  event_type = 'APPOINTMENT'
  and exists (
    select 1
    from public.patients p
    where p.id = public.care_events.patient_id
      and p.auth_user_id = auth.uid()
  )
)
with check (
  event_type = 'APPOINTMENT'
  and exists (
    select 1
    from public.patients p
    where p.id = public.care_events.patient_id
      and p.auth_user_id = auth.uid()
  )
  and author_id = auth.uid()
);

commit;

select
  has_table_privilege('authenticated', 'public.appointments', 'INSERT') as authenticated_can_insert_appointments,
  has_table_privilege('authenticated', 'public.appointments', 'UPDATE') as authenticated_can_update_appointments,
  has_table_privilege('authenticated', 'public.care_events', 'UPDATE') as authenticated_can_update_events;
