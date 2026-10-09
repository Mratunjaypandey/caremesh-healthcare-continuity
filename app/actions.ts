'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireRole, requireUser } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { computeCareGaps } from '@/lib/care-gaps';
import { createAdminClient } from '@/lib/supabase/admin';

const patientSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  gender: z.enum(['Male','Female','Other','Prefer not to say']),
  dob: z.string().min(10),
  mobile: z.string().regex(/^\d{10}$/),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().trim().max(300).optional(),
  emergency_contact: z.string().trim().max(160).optional(),
  consent_recorded: z.string().optional().transform((v) => v === 'true'),
});

const eventSchema = z.object({
  patient_id: z.string().uuid(),
  event_type: z.enum(['OPD','ADMISSION','LAB','FOLLOW_UP','BILLING','DOCUMENT','APPOINTMENT','PATIENT_NOTE']),
  event_status: z.enum(['PLANNED','SCHEDULED','IN_PROGRESS','COMPLETED','FINAL','CANCELLED','PENDING','RESCHEDULED']).optional(),
  event_date: z.string().min(10),
  event_time: z.string().optional(),
  department: z.string().max(120).optional(),
  clinician: z.string().max(120).optional(),
  title: z.string().trim().min(2).max(180),
  summary: z.string().trim().max(2000).optional(),
  prescription: z.string().trim().max(1200).optional(),
  next_follow_up: z.string().optional(),
});

const appointmentSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_date: z.string().min(10),
  appointment_time: z.string().min(4),
  department: z.string().trim().min(2).max(120),
  clinician: z.string().trim().min(2).max(120),
  status: z.enum(['SCHEDULED','COMPLETED','CANCELLED','RESCHEDULED','NO_SHOW']),
  reason: z.string().trim().min(2).max(300),
  notes: z.string().trim().max(1200).optional(),
  id: z.string().uuid().optional(),
});

async function validateAppointmentDirectory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  departmentName: string,
  clinicianName: string,
) {
  const [departmentResult, clinicianResult] = await Promise.all([
    supabase
      .from('departments')
      .select('id,name')
      .eq('org_id', orgId)
      .eq('is_active', true),
    // Validate the clinician assignment by foreign-key ID instead of a
    // nested relationship projection, whose TypeScript shape varies with
    // Supabase-generated relationship types.
    supabase
      .from('clinicians')
      .select('id,full_name,department_id')
      .eq('org_id', orgId)
      .eq('is_active', true),
  ]);

  const missingTableCodes = new Set(['42P01', 'PGRST205']);
  const departmentMissing = Boolean(departmentResult.error && missingTableCodes.has(departmentResult.error.code));
  const clinicianMissing = Boolean(clinicianResult.error && missingTableCodes.has(clinicianResult.error.code));

  if (departmentResult.error && !departmentMissing) throw new Error(`Department directory lookup failed: ${departmentResult.error.message}`);
  if (clinicianResult.error && !clinicianMissing) throw new Error(`Clinician directory lookup failed: ${clinicianResult.error.message}`);

  const departments = departmentResult.data ?? [];
  const clinicians = clinicianResult.data ?? [];

  if (!departmentMissing && departments.length && !departments.some((item: any) => item.name === departmentName)) {
    throw new Error('Choose an active department from the CareMesh directory.');
  }

  const selectedClinician = !clinicianMissing
    ? clinicians.find((item: any) => item.full_name === clinicianName)
    : null;

  if (!clinicianMissing && clinicians.length > 0 && !selectedClinician) {
    throw new Error('Choose an active clinician from the CareMesh directory.');
  }

  const selectedDepartment = !departmentMissing
    ? departments.find((item: any) => item.name === departmentName)
    : null;

  if (
    selectedClinician?.department_id &&
    selectedDepartment &&
    selectedClinician.department_id !== selectedDepartment.id
  ) {
    throw new Error(
      'The selected clinician is assigned to a different department. Choose the matching department or update the clinician directory.',
    );
  }
}

const patientUpdateSchema = z.object({
  patient_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  gender: z.enum(['Male','Female','Other','Prefer not to say']),
  dob: z.string().min(10),
  mobile: z.string().regex(/^\d{10}$/),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().trim().max(300).optional(),
  emergency_contact: z.string().trim().max(160).optional(),
  consent_recorded: z.string().optional().transform((v) => v === 'true'),
});

const eventUpdateSchema = eventSchema.extend({ id: z.string().uuid() });

async function refreshCareGaps(patientId: string, orgId: string) {
  const supabase = await createClient();
  const [{ data: events }, { data: appointments }, { data: documents }] = await Promise.all([
    supabase.from('care_events').select('id,event_type,event_status,event_date,event_time,title,summary,next_follow_up,metadata').eq('patient_id', patientId).order('event_date', { ascending: false }),
    supabase.from('appointments').select('id,appointment_date,status').eq('patient_id', patientId),
    supabase.from('documents').select('id,linked_event_id,status').eq('patient_id', patientId),
  ]);
  const gaps = computeCareGaps(events ?? [], appointments ?? [], documents ?? []);
  await supabase.from('care_gaps').delete().eq('patient_id', patientId).neq('status', 'RESOLVED');
  if (!gaps.length) return;
  await supabase.from('care_gaps').insert(gaps.map((gap) => ({
    org_id: orgId,
    patient_id: patientId,
    gap_type: gap.gapType,
    severity: gap.severity,
    description: gap.description,
    source_event_ids: gap.sourceEventIds,
  })));
}

export async function registerPatient(formData: FormData) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const parsed = patientSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();

  const { data: duplicate } = await supabase.from('patients').select('id').eq('org_id', user.orgId).eq('mobile', parsed.mobile).maybeSingle();
  if (duplicate) throw new Error('A patient with this mobile number already exists in this organization.');

  const patientCode = `CM-${new Date().getFullYear()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const { data: patient, error } = await supabase.from('patients').insert({
    org_id: user.orgId,
    patient_code: patientCode,
    full_name: parsed.full_name,
    gender: parsed.gender,
    dob: parsed.dob,
    mobile: parsed.mobile,
    email: parsed.email || null,
    address: parsed.address || null,
    emergency_contact: parsed.emergency_contact || null,
    consent_recorded: parsed.consent_recorded,
    created_by: user.id,
  }).select('id').single();
  if (error) throw new Error(error.message);

  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: 'Created patient profile', entityType: 'patient', entityId: patient.id, metadata: { patient_code: patientCode } });
  revalidatePath('/admin');
  revalidatePath('/admin/patients');
}

export async function addCareEvent(formData: FormData) {
  const user = await requireRole(['ADMIN','CLINICIAN','PATIENT']);
  const parsed = eventSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();

  const { data: patient } = await supabase.from('patients').select('id,org_id,auth_user_id,full_name').eq('id', parsed.patient_id).single();
  if (!patient || patient.org_id !== user.orgId) throw new Error('Patient not found.');
  if (user.role === 'PATIENT' && (parsed.event_type !== 'PATIENT_NOTE' || patient.auth_user_id !== user.id)) throw new Error('Patients can only create their own patient notes.');

  const { data: event, error } = await supabase.from('care_events').insert({
    org_id: user.orgId,
    patient_id: parsed.patient_id,
    event_type: parsed.event_type,
    event_status: parsed.event_status ?? (parsed.event_type === 'LAB' ? 'FINAL' : 'COMPLETED'),
    event_date: parsed.event_date,
    event_time: parsed.event_time || null,
    department: parsed.department || null,
    clinician: parsed.clinician || null,
    title: parsed.title,
    summary: parsed.summary || null,
    prescription: parsed.prescription || null,
    next_follow_up: parsed.next_follow_up || null,
    author_id: user.id,
    author_role: user.role,
    source_label: user.role === 'PATIENT' ? 'Patient-submitted' : 'Hospital / Lab',
    metadata: {},
  }).select('id').single();
  if (error) throw new Error(error.message);

  if (user.role !== 'PATIENT') {
    await supabase.from('notifications').insert({ org_id: user.orgId, patient_id: parsed.patient_id, title: 'New record added', message: `${parsed.title} was added to your CareMesh timeline.`, kind: parsed.event_type });
  }
  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: `Created ${parsed.event_type} event`, entityType: 'care_event', entityId: event.id });
  await refreshCareGaps(parsed.patient_id, user.orgId);

  revalidatePath(`/admin/patients/${parsed.patient_id}`);
  revalidatePath('/admin');
  revalidatePath('/admin/care-gaps');
  revalidatePath('/patient');
  revalidatePath('/patient/timeline');
}

export async function createAppointment(formData: FormData) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const parsed = appointmentSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();
  const { data: patient } = await supabase.from('patients').select('id,org_id,full_name').eq('id', parsed.patient_id).maybeSingle();
  if (!patient || patient.org_id !== user.orgId) throw new Error('Patient not found in your organization.');
  await validateAppointmentDirectory(supabase, user.orgId, parsed.department, parsed.clinician);

  const payload = {
    org_id: user.orgId,
    patient_id: parsed.patient_id,
    appointment_date: parsed.appointment_date,
    appointment_time: parsed.appointment_time,
    department: parsed.department,
    clinician: parsed.clinician,
    status: parsed.status,
    reason: parsed.reason,
    notes: parsed.notes || null,
    updated_by: user.id,
  };

  let appointmentId = parsed.id;
  if (parsed.id) {
    const { error } = await supabase.from('appointments').update(payload).eq('id', parsed.id).eq('org_id', user.orgId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from('appointments').insert({ ...payload, created_by: user.id }).select('id').single();
    if (error) throw new Error(error.message);
    appointmentId = data.id;
  }

  const eventPayload = {
    org_id: user.orgId,
    patient_id: parsed.patient_id,
    event_type: 'APPOINTMENT' as const,
    event_status: parsed.status,
    event_date: parsed.appointment_date,
    event_time: parsed.appointment_time,
    department: parsed.department,
    clinician: parsed.clinician,
    title: `Appointment ${parsed.status.toLowerCase()}`,
    summary: parsed.reason,
    author_id: user.id,
    author_role: user.role,
    source_label: 'CareMesh Appointments',
    metadata: { appointment_id: appointmentId },
  };

  if (appointmentId) {
    const { data: existingEvent } = await supabase
      .from('care_events')
      .select('id')
      .eq('patient_id', parsed.patient_id)
      .contains('metadata', { appointment_id: appointmentId })
      .maybeSingle();

    if (existingEvent) {
      const { error } = await supabase.from('care_events').update(eventPayload).eq('id', existingEvent.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from('care_events').insert(eventPayload);
      if (error) throw new Error(error.message);
    }
  }

  await supabase.from('notifications').insert({
    org_id: user.orgId,
    patient_id: parsed.patient_id,
    title: parsed.id ? 'Appointment updated' : 'Appointment created',
    message: `Your ${parsed.department} appointment is ${parsed.status.toLowerCase()} for ${parsed.appointment_date} at ${parsed.appointment_time.slice(0,5)}.`,
    kind: 'APPOINTMENT',
  });

  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: parsed.id ? 'Updated appointment' : 'Created appointment', entityType: 'appointment', entityId: appointmentId, metadata: { status: parsed.status } });
  await refreshCareGaps(parsed.patient_id, user.orgId);

  revalidatePath('/admin');
  revalidatePath('/admin/appointments');
  revalidatePath(`/admin/patients/${parsed.patient_id}`);
  revalidatePath('/patient');
  revalidatePath('/patient/appointments');
  revalidatePath('/patient/notifications');
}

export async function updatePatient(formData: FormData) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const parsed = patientUpdateSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from('patients')
    .select('id,org_id')
    .eq('id', parsed.patient_id)
    .maybeSingle();
  if (!patient || patient.org_id !== user.orgId) throw new Error('Patient not found in your organization.');

  const { data: duplicate } = await supabase
    .from('patients')
    .select('id')
    .eq('org_id', user.orgId)
    .eq('mobile', parsed.mobile)
    .neq('id', parsed.patient_id)
    .maybeSingle();
  if (duplicate) throw new Error('Another patient in this organization already uses this mobile number.');

  const { error } = await supabase.from('patients').update({
    full_name: parsed.full_name,
    gender: parsed.gender,
    dob: parsed.dob,
    mobile: parsed.mobile,
    email: parsed.email || null,
    address: parsed.address || null,
    emergency_contact: parsed.emergency_contact || null,
    consent_recorded: parsed.consent_recorded,
  }).eq('id', parsed.patient_id).eq('org_id', user.orgId);
  if (error) throw new Error(error.message);

  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: 'Corrected patient master profile', entityType: 'patient', entityId: parsed.patient_id });
  revalidatePath(`/admin/patients/${parsed.patient_id}`);
  revalidatePath('/admin/patients');
  revalidatePath('/admin');
}

export async function updateCareEvent(formData: FormData) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const parsed = eventUpdateSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();

  const { data: event } = await supabase.from('care_events').select('id,org_id,patient_id').eq('id', parsed.id).maybeSingle();
  if (!event || event.org_id !== user.orgId) throw new Error('Care event not found in your organization.');

  const { error } = await supabase.from('care_events').update({
    event_type: parsed.event_type,
    event_status: parsed.event_status ?? 'COMPLETED',
    event_date: parsed.event_date,
    event_time: parsed.event_time || null,
    department: parsed.department || null,
    clinician: parsed.clinician || null,
    title: parsed.title,
    summary: parsed.summary || null,
    prescription: parsed.prescription || null,
    next_follow_up: parsed.next_follow_up || null,
  }).eq('id', parsed.id).eq('org_id', user.orgId);
  if (error) throw new Error(error.message);

  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: 'Corrected care event', entityType: 'care_event', entityId: parsed.id });
  await refreshCareGaps(event.patient_id, user.orgId);
  revalidatePath(`/admin/patients/${event.patient_id}`);
  revalidatePath('/admin');
  revalidatePath('/admin/care-gaps');
  revalidatePath('/patient');
  revalidatePath('/patient/timeline');
}

export async function bookPatientAppointment(formData: FormData) {
  const user = await requireRole(['PATIENT']);
  if (!user.patientId) throw new Error('No patient profile is linked to this account.');
  const parsed = appointmentSchema.omit({ patient_id: true, id: true, status: true }).parse({
    ...Object.fromEntries(formData.entries()),
  });
  const supabase = await createClient();
  await validateAppointmentDirectory(supabase, user.orgId, parsed.department, parsed.clinician);

  const payload = {
    org_id: user.orgId,
    patient_id: user.patientId,
    appointment_date: parsed.appointment_date,
    appointment_time: parsed.appointment_time,
    department: parsed.department,
    clinician: parsed.clinician,
    status: 'SCHEDULED' as const,
    reason: parsed.reason,
    notes: parsed.notes || null,
    created_by: user.id,
    updated_by: user.id,
  };

  const { data: appointment, error } = await supabase.from('appointments').insert(payload).select('id').single();
  if (error) throw new Error(error.message);

  const { error: eventError } = await supabase.from('care_events').insert({
    org_id: user.orgId,
    patient_id: user.patientId,
    event_type: 'APPOINTMENT',
    event_status: 'SCHEDULED',
    event_date: parsed.appointment_date,
    event_time: parsed.appointment_time,
    department: parsed.department,
    clinician: parsed.clinician,
    title: 'Appointment requested',
    summary: parsed.reason,
    author_id: user.id,
    author_role: 'PATIENT',
    source_label: 'Patient booking',
    metadata: { appointment_id: appointment.id },
  });
  if (eventError) throw new Error(eventError.message);

  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: 'PATIENT', action: 'Booked appointment', entityType: 'appointment', entityId: appointment.id });
  await refreshCareGaps(user.patientId, user.orgId);
  revalidatePath('/patient');
  revalidatePath('/patient/appointments');
}

export async function managePatientAppointment(formData: FormData) {
  const user = await requireRole(['PATIENT']);
  if (!user.patientId) throw new Error('No patient profile is linked to this account.');
  const parsed = z.object({
    id: z.string().uuid(),
    appointment_date: z.string().min(10),
    appointment_time: z.string().min(4),
    status: z.enum(['RESCHEDULED','CANCELLED']),
    notes: z.string().max(1200).optional(),
  }).parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();

  const { data: appointment, error: appointmentReadError } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', parsed.id)
    .eq('patient_id', user.patientId)
    .maybeSingle();

  if (appointmentReadError) {
    throw new Error(`Appointment lookup failed: ${appointmentReadError.message}`);
  }
  if (!appointment) throw new Error('Appointment not found.');

  if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(appointment.status)) {
    throw new Error('This appointment can no longer be changed. Contact your care team if you need help.');
  }

  // Cancelling must not silently change the originally scheduled date/time.
  // A reschedule request uses the new date/time entered by the patient.
  const nextDate = parsed.status === 'RESCHEDULED'
    ? parsed.appointment_date
    : appointment.appointment_date;
  const nextTime = parsed.status === 'RESCHEDULED'
    ? parsed.appointment_time
    : appointment.appointment_time;

  const { error: updateError } = await supabase
    .from('appointments')
    .update({
      appointment_date: nextDate,
      appointment_time: nextTime,
      status: parsed.status,
      notes: parsed.notes?.trim() || appointment.notes || null,
      updated_by: user.id,
    })
    .eq('id', parsed.id)
    .eq('patient_id', user.patientId);

  if (updateError) throw new Error(updateError.message);

  const { data: event, error: eventLookupError } = await supabase
    .from('care_events')
    .select('id')
    .eq('patient_id', user.patientId)
    .contains('metadata', { appointment_id: parsed.id })
    .maybeSingle();

  if (eventLookupError) {
    throw new Error(`Appointment timeline lookup failed: ${eventLookupError.message}`);
  }

  if (event) {
    const { error: eventUpdateError } = await supabase
      .from('care_events')
      .update({
        event_status: parsed.status,
        event_date: nextDate,
        event_time: nextTime,
        title: parsed.status === 'CANCELLED'
          ? 'Appointment cancelled'
          : 'Appointment reschedule requested',
      })
      .eq('id', event.id)
      .eq('patient_id', user.patientId);

    if (eventUpdateError) {
      throw new Error(`Appointment timeline update failed: ${eventUpdateError.message}`);
    }
  }

  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: 'PATIENT',
    action: parsed.status === 'CANCELLED'
      ? 'Cancelled appointment'
      : 'Requested appointment reschedule',
    entityType: 'appointment',
    entityId: parsed.id,
    metadata: {
      previous_status: appointment.status,
      status: parsed.status,
      appointment_date: nextDate,
      appointment_time: nextTime,
    },
  });

  revalidatePath('/patient');
  revalidatePath('/patient/appointments');
  revalidatePath('/patient/notifications');
  revalidatePath('/admin/appointments');
  revalidatePath(`/admin/patients/${user.patientId}`);
}


export async function markNotificationRead(formData: FormData) {
  const user = await requireRole(['PATIENT']);
  const notificationId = z.string().uuid().parse(formData.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).eq('patient_id', user.patientId!);
  if (error) throw new Error(error.message);
  revalidatePath('/patient/notifications');
  revalidatePath('/patient');
}

export async function markAllNotificationsRead() {
  const user = await requireRole(['PATIENT']);
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('patient_id', user.patientId!).is('read_at', null);
  if (error) throw new Error(error.message);
  revalidatePath('/patient/notifications');
}

export async function addPatientNote(formData: FormData) {
  const user = await requireRole(['PATIENT']);
  if (!user.patientId) throw new Error('No patient profile is linked to this account.');
  const form = z.object({ title: z.string().min(2).max(150), summary: z.string().min(2).max(2000) }).parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();
  const { data: note, error } = await supabase
    .from('care_events')
    .insert({
      org_id: user.orgId,
      patient_id: user.patientId,
      event_type: 'PATIENT_NOTE',
      event_status: 'COMPLETED',
      event_date: new Date().toISOString().slice(0, 10),
      title: form.title,
      summary: form.summary,
      author_id: user.id,
      author_role: 'PATIENT',
      source_label: 'Patient-submitted',
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  // Supplying entityId lets the database audit policy verify that this
  // event really is a PATIENT_NOTE authored by the authenticated patient.
  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: 'PATIENT',
    action: 'Created patient note',
    entityType: 'care_event',
    entityId: note.id,
    metadata: { title: form.title },
  });
  revalidatePath('/patient');
  revalidatePath('/patient/timeline');
}

export async function reviewDocument(formData: FormData) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const form = z.object({ id: z.string().uuid(), status: z.enum(['ACCEPTED','REJECTED','FINAL']) }).parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();
  const { data: doc, error: fetchError } = await supabase.from('documents').select('id,patient_id,file_name').eq('id', form.id).single();
  if (fetchError || !doc) throw new Error(fetchError?.message || 'Document not found.');
  const { error } = await supabase.from('documents').update({ status: form.status }).eq('id', form.id);
  if (error) throw new Error(error.message);
  if (form.status === 'ACCEPTED') {
    await supabase.from('notifications').insert({ org_id: user.orgId, patient_id: doc.patient_id, title: 'Document accepted', message: `${doc.file_name} was reviewed and accepted.`, kind: 'DOCUMENT' });
  } else if (form.status === 'REJECTED') {
    await supabase.from('notifications').insert({ org_id: user.orgId, patient_id: doc.patient_id, title: 'Document needs review', message: `${doc.file_name} was reviewed and marked for resubmission.`, kind: 'DOCUMENT' });
  }
  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: `Reviewed document as ${form.status}`, entityType: 'document', entityId: form.id });
  await refreshCareGaps(doc.patient_id, user.orgId);
  revalidatePath(`/admin/patients/${doc.patient_id}`);
  revalidatePath('/patient/documents');
  revalidatePath('/patient');
}

export async function resolveCareGap(formData: FormData) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const gapId = z.string().uuid().parse(formData.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.from('care_gaps').update({ status: 'RESOLVED', resolved_at: new Date().toISOString(), resolved_by: user.id }).eq('id', gapId);
  if (error) throw new Error(error.message);
  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: 'Resolved care gap', entityType: 'care_gap', entityId: gapId });
  revalidatePath('/admin/care-gaps');
  revalidatePath('/admin');
}

const departmentCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(30).optional(),
  description: z.string().trim().max(500).optional(),
});

const departmentUpdateSchema = departmentCreateSchema.extend({
  id: z.string().uuid(),
  is_active: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

const clinicianCreateSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  title: z.string().trim().max(40).optional(),
  specialty: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  mobile: z.string().trim().regex(/^[0-9]{10}$/).optional().or(z.literal('')),
  department_id: z.string().uuid().optional().or(z.literal('')),
});

const clinicianUpdateSchema = clinicianCreateSchema.extend({
  id: z.string().uuid(),
  is_active: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

export async function createDepartment(formData: FormData) {
  const user = await requireRole(['ADMIN']);
  const parsed = departmentCreateSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();
  const { data, error } = await supabase.from('departments').insert({
    org_id: user.orgId,
    name: parsed.name,
    code: parsed.code || null,
    description: parsed.description || null,
    is_active: true,
    created_by: user.id,
  }).select('id').single();
  if (error) throw new Error(error.message);
  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: 'Created department', entityType: 'department', entityId: data.id, metadata: { name: parsed.name } });
  revalidatePath('/admin/team');
  revalidatePath('/admin/appointments');
  revalidatePath('/patient/appointments');
}

export async function updateDepartment(formData: FormData) {
  const user = await requireRole(['ADMIN']);
  const parsed = departmentUpdateSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();
  const { data: current } = await supabase.from('departments').select('id,name').eq('id', parsed.id).eq('org_id', user.orgId).maybeSingle();
  if (!current) throw new Error('Department not found in your organization.');
  const { error } = await supabase.from('departments').update({
    name: parsed.name,
    code: parsed.code || null,
    description: parsed.description || null,
    is_active: parsed.is_active,
  }).eq('id', parsed.id).eq('org_id', user.orgId);
  if (error) throw new Error(error.message);
  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: parsed.is_active ? 'Updated department' : 'Deactivated department', entityType: 'department', entityId: parsed.id, metadata: { previous_name: current.name, name: parsed.name, is_active: parsed.is_active } });
  revalidatePath('/admin/team');
  revalidatePath('/admin/appointments');
  revalidatePath('/patient/appointments');
}

export async function createClinician(formData: FormData) {
  const user = await requireRole(['ADMIN']);
  const parsed = clinicianCreateSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();

  if (parsed.department_id) {
    const { data: department } = await supabase.from('departments').select('id').eq('id', parsed.department_id).eq('org_id', user.orgId).maybeSingle();
    if (!department) throw new Error('Select a department from your organization.');
  }

  const { data, error } = await supabase.from('clinicians').insert({
    org_id: user.orgId,
    full_name: parsed.full_name,
    title: parsed.title || null,
    specialty: parsed.specialty || null,
    email: parsed.email || null,
    mobile: parsed.mobile || null,
    department_id: parsed.department_id || null,
    is_active: true,
    created_by: user.id,
  }).select('id').single();
  if (error) throw new Error(error.message);
  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: 'Added clinician directory entry', entityType: 'clinician', entityId: data.id, metadata: { full_name: parsed.full_name, specialty: parsed.specialty || null } });
  revalidatePath('/admin/team');
  revalidatePath('/admin/appointments');
  revalidatePath('/patient/appointments');
}

export async function updateClinician(formData: FormData) {
  const user = await requireRole(['ADMIN']);
  const parsed = clinicianUpdateSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();
  const { data: current } = await supabase.from('clinicians').select('id,full_name,auth_user_id').eq('id', parsed.id).eq('org_id', user.orgId).maybeSingle();
  if (!current) throw new Error('Clinician not found in your organization.');

  if (parsed.department_id) {
    const { data: department } = await supabase.from('departments').select('id').eq('id', parsed.department_id).eq('org_id', user.orgId).maybeSingle();
    if (!department) throw new Error('Select a department from your organization.');
  }

  // If this clinician has a portal account, the active directory switch also
  // suspends/restores that clinician's organization membership.
  if (current.auth_user_id) {
    const admin = createAdminClient();
    const { error: membershipError } = await admin.from('organization_memberships')
      .update({ status: parsed.is_active ? 'active' : 'suspended' })
      .eq('org_id', user.orgId).eq('user_id', current.auth_user_id).eq('role', 'CLINICIAN');
    if (membershipError) throw new Error(`Clinician access update failed: ${membershipError.message}`);
  }

  const { error } = await supabase.from('clinicians').update({
    full_name: parsed.full_name,
    title: parsed.title || null,
    specialty: parsed.specialty || null,
    email: parsed.email || null,
    mobile: parsed.mobile || null,
    department_id: parsed.department_id || null,
    is_active: parsed.is_active,
  }).eq('id', parsed.id).eq('org_id', user.orgId);
  if (error) throw new Error(error.message);
  await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: parsed.is_active ? 'Updated clinician directory entry' : 'Deactivated clinician and suspended portal access when linked', entityType: 'clinician', entityId: parsed.id, metadata: { previous_name: current.full_name, full_name: parsed.full_name, is_active: parsed.is_active } });
  revalidatePath('/admin/team');
  revalidatePath('/admin/appointments');
  revalidatePath('/patient/appointments');
}

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  mobile: z.string().regex(/^[0-9]{10}$/).or(z.literal('')),
});

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const parsed = profileSchema.parse(Object.fromEntries(formData.entries()));
  const supabase = await createClient();

  const { error } = await supabase.from('profiles').update({
    full_name: parsed.full_name,
    mobile: parsed.mobile || null,
  }).eq('id', user.id);

  if (error) throw new Error(error.message);

  await writeAudit({
    orgId: user.orgId,
    actorId: user.id,
    actorRole: user.role,
    action: 'Updated profile',
    entityType: 'profile',
    entityId: user.id,
  });

  revalidatePath('/profile');
  revalidatePath('/patient');
  revalidatePath('/admin');
}
