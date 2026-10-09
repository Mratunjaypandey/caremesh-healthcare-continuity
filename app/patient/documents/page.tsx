import Link from 'next/link';
import { FileText } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatusBadge } from '@/components/ui';
import { DocumentUploadForm } from '@/components/document-upload-form';
import { DocumentManager } from '@/components/document-manager';

export default async function PatientDocuments() {
  const user = await requireRole(['PATIENT']);
  const supabase = await createClient();
  const [{ data: docs }, { data: events }] = await Promise.all([
    supabase.from('documents').select('*').eq('patient_id', user.patientId!).order('created_at',{ascending:false}),
    supabase.from('care_events').select('id,title,event_date').eq('patient_id', user.patientId!).order('event_date',{ascending:false}),
  ]);

  return <>
    <PageHeader
      eyebrow="Document vault"
      title="My documents"
      description="Keep prescriptions, reports, discharge paperwork and other supporting records in one private, easy-to-manage place."
      actions={<Link className="btn btn-secondary" href="/patient">Back to overview</Link>}
    />

    <DocumentUploadForm
      patientId={user.patientId!}
      events={(events ?? []).map((e:any)=>({id:e.id,title:e.title,event_date:e.event_date}))}
    />

    <section className="panel document-registry-panel">
      <div className="panel-head">
        <div><h2>Document library</h2><p>Search, filter and securely download your records.</p></div>
        <StatusBadge tone="blue">{docs?.length ?? 0} files</StatusBadge>
      </div>
      <DocumentManager documents={(docs ?? []).map((doc:any) => ({
        id: doc.id,
        file_name: doc.file_name,
        mime_type: doc.mime_type,
        size_bytes: doc.size_bytes,
        document_type: doc.document_type,
        source_role: doc.source_role,
        status: doc.status,
        linked_event_id: doc.linked_event_id,
        created_at: doc.created_at,
        notes: doc.notes,
      }))}/>
    </section>

    <div className="mini-note" style={{marginTop:12}}><FileText size={15}/><span>CareMesh never exposes medical documents as public links. Downloads use short-lived signed URLs.</span></div>
  </>;
}
