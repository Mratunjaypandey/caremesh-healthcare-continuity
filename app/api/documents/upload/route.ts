import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { sanitizeFileName } from '@/lib/utils';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const allowedTypes = new Set(['application/pdf','image/jpeg','image/png','text/plain']);
const maxBytes = Number(process.env.DOCUMENT_MAX_MB || 10) * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const form = await request.formData();
    const file = form.get('file');
    const patientId = z.string().uuid().parse(form.get('patientId'));
    const documentType = z.string().min(2).max(80).parse(form.get('documentType'));
    const linkedEventId = String(form.get('linkedEventId') || '');
    const notes = String(form.get('notes') || '').slice(0, 2000);
    if (!(file instanceof File)) return Response.json({ error: 'File is required.' }, { status: 400 });
    if (!allowedTypes.has(file.type)) return Response.json({ error: 'Unsupported file type.' }, { status: 415 });
    if (file.size > maxBytes) return Response.json({ error: `File exceeds ${process.env.DOCUMENT_MAX_MB || 10} MB.` }, { status: 413 });

    const supabase = await createClient();
    const { data: patient } = await supabase.from('patients').select('id,org_id,auth_user_id').eq('id', patientId).single();
    if (!patient || patient.org_id !== user.orgId) return Response.json({ error: 'Patient not found.' }, { status: 404 });
    if (user.role === 'PATIENT' && patient.auth_user_id !== user.id) return Response.json({ error: 'Forbidden.' }, { status: 403 });

    const sourceRole = user.role === 'PATIENT' ? 'PATIENT' : 'ADMIN';
    const storagePath = `${patientId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: storageError } = await supabase.storage.from('caremesh-documents').upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (storageError) throw new Error(storageError.message);

    const { data: document, error } = await supabase.from('documents').insert({
      org_id: user.orgId,
      patient_id: patientId,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      document_type: documentType,
      source_role: sourceRole,
      author_id: user.id,
      status: sourceRole === 'PATIENT' ? 'SUBMITTED' : 'FINAL',
      linked_event_id: linkedEventId || null,
      notes: notes || null,
    }).select('id').single();
    if (error) {
      await supabase.storage.from('caremesh-documents').remove([storagePath]);
      throw new Error(error.message);
    }

    await supabase.from('care_events').insert({
      org_id: user.orgId,
      patient_id: patientId,
      event_type: 'DOCUMENT',
      event_status: sourceRole === 'PATIENT' ? 'PENDING' : 'FINAL',
      event_date: new Date().toISOString().slice(0,10),
      title: file.name,
      summary: `${sourceRole === 'PATIENT' ? 'Patient-submitted' : 'Admin-added'} ${documentType.toLowerCase()} uploaded to the record.`,
      author_id: user.id,
      author_role: user.role,
      source_label: sourceRole === 'PATIENT' ? 'Patient upload' : 'Hospital / Lab',
      metadata: { document_id: document.id },
    });

    if (sourceRole === 'PATIENT') {
      await supabase.from('notifications').insert({ org_id: user.orgId, patient_id: patientId, title: 'Document received', message: `${file.name} was uploaded and is awaiting review.`, kind: 'DOCUMENT' });
    }
    await writeAudit({ orgId: user.orgId, actorId: user.id, actorRole: user.role, action: `Uploaded ${documentType}`, entityType: 'document', entityId: document.id, metadata: { file_name: file.name, size_bytes: file.size } });
    return Response.json({ id: document.id });
  } catch (error) {
    console.error('Upload error', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 });
  }
}
