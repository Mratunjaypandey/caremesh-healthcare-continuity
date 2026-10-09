import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { askPatientAssistant, buildFallbackAssistant, isGeminiTransientFailure } from '@/lib/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  message: z.string().trim().min(1).max(1200),
  history: z.array(z.object({ role: z.enum(['user','assistant']), text: z.string().max(1600) })).max(10).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'PATIENT' || !user.patientId) {
      return Response.json({ error: 'This assistant is available to authenticated patients.' }, { status: 403 });
    }

    const body = schema.parse(await request.json());
    const supabase = await createClient();

    const [{ data: patient, error: patientError }, { data: events, error: eventsError }, { data: appointments, error: appointmentsError }, { data: documents, error: documentsError }, { data: gaps, error: gapsError }] = await Promise.all([
      supabase.from('patients').select('id,patient_code,full_name,gender,dob').eq('id', user.patientId).eq('auth_user_id', user.id).single(),
      supabase.from('care_events').select('id,event_type,event_status,event_date,event_time,title,summary,next_follow_up,department,clinician,source_label').eq('patient_id', user.patientId).order('event_date',{ascending:false}).order('event_time',{ascending:false}).limit(60),
      supabase.from('appointments').select('id,appointment_date,appointment_time,department,clinician,status,reason').eq('patient_id', user.patientId).order('appointment_date').order('appointment_time').limit(30),
      supabase.from('documents').select('id,file_name,document_type,status,linked_event_id,created_at').eq('patient_id', user.patientId).order('created_at',{ascending:false}).limit(30),
      supabase.from('care_gaps').select('id,gap_type,severity,description,source_event_ids,status').eq('patient_id', user.patientId).neq('status','RESOLVED').limit(20),
    ]);

    if (patientError || !patient) throw new Error(patientError?.message || 'Patient record not found.');
    if (eventsError) throw new Error(eventsError.message);
    if (appointmentsError) throw new Error(appointmentsError.message);
    if (documentsError) throw new Error(documentsError.message);
    if (gapsError) throw new Error(gapsError.message);

    try {
      const result = await askPatientAssistant({
        patient,
        events: events ?? [],
        appointments: appointments ?? [],
        documents: documents ?? [],
        gaps: gaps ?? [],
        message: body.message,
        history: body.history,
      });

      return Response.json(result);
    } catch (error) {
      if (isGeminiTransientFailure(error)) {
        return Response.json({
          ...buildFallbackAssistant({
            message: body.message,
            events: events ?? [],
            appointments: appointments ?? [],
            documents: documents ?? [],
            gaps: gaps ?? [],
          }),
          model: 'record-fallback',
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('CareMesh AI assistant error:', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Assistant failed.' }, { status: 500 });
  }
}
