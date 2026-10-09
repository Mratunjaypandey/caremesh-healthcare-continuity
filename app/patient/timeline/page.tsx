import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addPatientNote } from '@/app/actions';
import { PageHeader, Timeline, StatusBadge } from '@/components/ui';
import { GenerateSummaryButton } from '@/components/generate-summary-button';

export default async function PatientTimeline({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireRole(['PATIENT']);
  const { type = 'ALL' } = await searchParams;
  const supabase = await createClient();
  const { data: events } = await supabase.from('care_events').select('*').eq('patient_id', user.patientId!).order('event_date',{ascending:false}).order('event_time',{ascending:false});
  const filtered = type === 'ALL' ? events ?? [] : (events ?? []).filter((e:any)=>e.event_type === type);
  const types = ['ALL','OPD','ADMISSION','LAB','FOLLOW_UP','APPOINTMENT','BILLING','DOCUMENT','PATIENT_NOTE'];
  return <>
    <PageHeader eyebrow="Patient timeline" title="My timeline" description="Source-linked chronological record. Patient notes are explicitly labeled." actions={<><GenerateSummaryButton patientId={user.patientId!}/><a className="btn btn-secondary" href={`/api/patients/${user.patientId}/report`}>Download report</a></>} />
    <section className="filter-bar">{types.map((t)=><Link className={`filter-chip ${type===t?'active':''}`} href={`/patient/timeline?type=${t}`} key={t}>{t.replaceAll('_',' ')}</Link>)}</section>
    <div className="dashboard-grid" style={{marginTop:14}}><section className="panel panel-large"><div className="panel-head"><div><h2>Chronological care journey</h2><p>Dates and source labels are preserved from the underlying records.</p></div><StatusBadge tone="blue">{filtered.length} events</StatusBadge></div><Timeline events={filtered}/></section><section className="panel"><div className="panel-head"><div><h2>Add a personal note</h2><p>This never edits an admin-created clinical record.</p></div></div><form action={addPatientNote} className="form-grid"><label className="full">Title<input name="title" required placeholder="e.g. I brought an outside prescription"/></label><label className="full">Note<textarea name="summary" rows={6} required placeholder="Add supporting information for your care journey"/></label><div className="full form-actions"><button className="btn btn-primary">Add patient note</button></div></form><div className="notice notice-blue" style={{marginTop:12}}>Patient-added records remain marked as patient-submitted and cannot overwrite admin-authored events.</div></section></div>
  </>;
}
