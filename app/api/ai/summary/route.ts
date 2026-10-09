import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { calculateAge } from '@/lib/utils';
import { computeCareGaps } from '@/lib/care-gaps';
import { buildFallbackCareSummary, generateCareSummary, getGeminiModel, isGeminiTransientFailure } from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requestSchema = z.object({ patientId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

    const raw = await request.text();
    if (!raw.trim()) return Response.json({ error: 'Request body is required.' }, { status: 400 });

    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch { return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 }); }

    const body = requestSchema.safeParse(parsed);
    if (!body.success) return Response.json({ error: 'Invalid patientId.' }, { status: 400 });

    const supabase = await createClient();
    const { patientId } = body.data;

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id,org_id,patient_code,dob,auth_user_id')
      .eq('id', patientId)
      .maybeSingle();

    if (patientError) throw new Error(patientError.message);
    if (!patient || patient.org_id !== user.orgId) return Response.json({ error: 'Patient not found.' }, { status: 404 });
    if (user.role === 'PATIENT' && patient.auth_user_id !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const [{ data: events }, { data: appointments }, { data: documents }, { data: existingGaps }] = await Promise.all([
      supabase.from('care_events').select('id,event_type,event_status,event_date,event_time,title,summary,prescription,next_follow_up,department,clinician,source_label,author_role').eq('patient_id', patientId).order('event_date').order('event_time').limit(Number(process.env.AI_MAX_EVENTS || 80)),
      supabase.from('appointments').select('id,appointment_date,appointment_time,department,clinician,status,reason').eq('patient_id', patientId).order('appointment_date'),
      supabase.from('documents').select('id,file_name,document_type,status,source_role,linked_event_id,created_at').eq('patient_id', patientId).order('created_at'),
      supabase.from('care_gaps').select('id,gap_type,severity,description,source_event_ids,status').eq('patient_id', patientId).neq('status','RESOLVED'),
    ]);

    const computedGaps = existingGaps?.length
      ? existingGaps
      : computeCareGaps(events ?? [], appointments ?? [], documents ?? []).map((g, i) => ({ id: `computed-${i}`, gap_type: g.gapType, severity: g.severity, description: g.description, source_event_ids: g.sourceEventIds }));

    const summaryInput = {
      patientCode: patient.patient_code,
      age: calculateAge(patient.dob),
      events: (events ?? []).map((e: any) => ({
        id: e.id, event_type: e.event_type, event_status: e.event_status, event_date: e.event_date,
        event_time: e.event_time, title: e.title, summary: e.summary, prescription: e.prescription,
        next_follow_up: e.next_follow_up, department: e.department, clinician: e.clinician,
        source_label: e.source_label, author_role: e.author_role,
      })),
      gaps: computedGaps.map((g: any) => ({
        id: g.id, gap_type: g.gapType ?? g.gap_type, severity: g.severity, description: g.description, source_event_ids: g.sourceEventIds ?? g.source_event_ids,
      })),
    };

    let summary;
    let summaryModel = getGeminiModel();
    try {
      summary = await generateCareSummary(summaryInput);
    } catch (error) {
      if (!isGeminiTransientFailure(error)) throw error;
      summary = buildFallbackCareSummary(summaryInput);
      summaryModel = 'record-fallback';
    }

    const sourceIds = new Set((events ?? []).map((e: any) => e.id));
    const invalidSource = [
      ...summary.timeline_highlights.flatMap((x) => x.source_event_ids),
      ...summary.continuity_gaps.flatMap((x) => x.source_event_ids),
    ].some((id) => id && !sourceIds.has(id));

    if (invalidSource) return Response.json({ error: 'The AI service returned an invalid source reference.' }, { status: 502 });

    const { data: report, error: reportError } = await supabase.from('reports').insert({
      org_id: user.orgId,
      patient_id: patientId,
      report_type: 'AI_HISTORY',
      model: summaryModel,
      content: summary,
      created_by: user.id,
    }).select('id').single();

    if (reportError) throw new Error(reportError.message);
    return Response.json({ reportId: report.id, summary, model: summaryModel });
  } catch (error) {
    console.error('CareMesh AI summary error:', error);
    return Response.json({ error: error instanceof Error ? error.message : 'AI summary failed.' }, { status: 500 });
  }
}
