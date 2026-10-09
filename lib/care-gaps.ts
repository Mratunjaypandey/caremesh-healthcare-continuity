export type CareGap = {
  gapType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  sourceEventIds: string[];
};

type EventRow = {
  id: string;
  event_type: string;
  event_status: string | null;
  event_date: string;
  event_time: string | null;
  title: string;
  summary: string | null;
  next_follow_up: string | null;
  metadata?: Record<string, unknown> | null;
};

type AppointmentRow = {
  id: string;
  appointment_date: string;
  status: string;
};

type DocumentRow = { id: string; linked_event_id: string | null; status: string };

export function computeCareGaps(events: EventRow[], appointments: AppointmentRow[], documents: DocumentRow[]): CareGap[] {
  const gaps: CareGap[] = [];

  const followUpEvents = events.filter((event) => event.next_follow_up);
  for (const event of followUpEvents) {
    const hasMatch = appointments.some(
      (appointment) => appointment.appointment_date >= String(event.next_follow_up) && !['CANCELLED', 'NO_SHOW'].includes(appointment.status),
    );
    if (!hasMatch) {
      gaps.push({
        gapType: 'Missing follow-up',
        severity: 'HIGH',
        description: `${event.title} records a follow-up for ${event.next_follow_up}, but no matching future appointment is present.`,
        sourceEventIds: [event.id],
      });
    }
  }

  const openAdmissions = events.filter((event) => event.event_type === 'ADMISSION' && !event.metadata?.discharge_date);
  for (const admission of openAdmissions) {
    gaps.push({
      gapType: 'Discharge summary pending',
      severity: 'HIGH',
      description: `${admission.event_date} admission does not have a documented discharge date/summary.`,
      sourceEventIds: [admission.id],
    });
  }

  const clinicalNotesReferToReport = events.filter((event) =>
    ['OPD', 'FOLLOW_UP'].includes(event.event_type) && /report|cbc|crp|diagnostic|lab/i.test(`${event.title} ${event.summary ?? ''}`),
  );
  for (const event of clinicalNotesReferToReport) {
    const linkedLab = events.some((candidate) => candidate.event_type === 'LAB' && candidate.event_date >= event.event_date);
    if (!linkedLab) {
      gaps.push({
        gapType: 'Referenced report missing',
        severity: 'MEDIUM',
        description: `${event.title} references diagnostics, but a matching lab event was not found.`,
        sourceEventIds: [event.id],
      });
    }
  }

  const duplicateKeyMap = new Map<string, string[]>();
  for (const event of events) {
    const key = `${event.event_type}|${event.event_date}|${event.title}`.toLowerCase();
    duplicateKeyMap.set(key, [...(duplicateKeyMap.get(key) ?? []), event.id]);
  }
  for (const [key, ids] of duplicateKeyMap.entries()) {
    if (ids.length > 1) {
      gaps.push({
        gapType: 'Timeline inconsistency',
        severity: 'MEDIUM',
        description: `Potential duplicate records were found for ${key.split('|').join(' · ')}.`,
        sourceEventIds: ids,
      });
    }
  }

  const pendingDocuments = documents.filter((doc) => doc.status === 'SUBMITTED');
  if (pendingDocuments.length > 0) {
    gaps.push({
      gapType: 'Patient document pending review',
      severity: 'LOW',
      description: `${pendingDocuments.length} patient-submitted document(s) are still awaiting review or acceptance.`,
      sourceEventIds: pendingDocuments.flatMap((doc) => doc.linked_event_id ? [doc.linked_event_id] : []),
    });
  }

  return gaps.slice(0, 6);
}
