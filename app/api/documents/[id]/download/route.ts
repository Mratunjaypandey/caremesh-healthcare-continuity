import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: document, error } = await supabase.from('documents').select('id,patient_id,storage_path,file_name').eq('id', id).maybeSingle();
  if (error || !document) return Response.json({ error: 'Document not found.' }, { status: 404 });
  if (user.role === 'PATIENT' && document.patient_id !== user.patientId) return Response.json({ error: 'Forbidden.' }, { status: 403 });
  const { data, error: signedError } = await supabase.storage.from('caremesh-documents').createSignedUrl(document.storage_path, 300);
  if (signedError || !data?.signedUrl) return Response.json({ error: signedError?.message || 'Could not create secure URL.' }, { status: 500 });
  return Response.json({ url: data.signedUrl, fileName: document.file_name, expiresIn: 300 });
}
