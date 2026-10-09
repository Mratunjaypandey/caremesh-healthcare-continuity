import Link from 'next/link';
import { CalendarClock, FileText, TriangleAlert, ClipboardList, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { computeCareGaps } from '@/lib/care-gaps';
import { MetricCard, PageHeader, Timeline, GapCard, StatusBadge, QuickLink } from '@/components/ui';
import { GenerateSummaryButton } from '@/components/generate-summary-button';
import { DocumentUploadForm } from '@/components/document-upload-form';
import { calculateAge } from '@/lib/utils';

export default async function PatientDashboard() {
  const user = await requireRole(['PATIENT']);
  const supabase = await createClient();
  if (!user.patientId) throw new Error('Your account is not linked to a patient record.');
  const [{ data: patient }, { data: events }, { data: docs }, { data: apps }, { data: gaps }, { data: latestReport }] = await Promise.all([
    supabase.from('patients').select('*').eq('id', user.patientId).single(),
    supabase.from('care_events').select('*').eq('patient_id', user.patientId).order('event_date',{ascending:false}).order('event_time',{ascending:false}),
    supabase.from('documents').select('*').eq('patient_id', user.patientId).order('created_at',{ascending:false}),
    supabase.from('appointments').select('*').eq('patient_id', user.patientId).order('appointment_date').order('appointment_time'),
    supabase.from('care_gaps').select('*').eq('patient_id', user.patientId).neq('status','RESOLVED').order('created_at',{ascending:false}),
    supabase.from('reports').select('id,content,created_at,model').eq('patient_id', user.patientId).eq('report_type','AI_HISTORY').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  const computed = computeCareGaps(events ?? [], apps ?? [], docs ?? []);
  const activeGaps = gaps?.length ? gaps : computed.map((g, i) => ({ id: `computed-${i}`, ...g }));

  return <>
    <PageHeader eyebrow="Patient Portal" title={`Welcome back, ${patient?.full_name.split(' ')[0]}.`} description="Your CareMesh record keeps important healthcare interactions connected in one place." actions={<><GenerateSummaryButton patientId={patient!.id}/><a className="btn btn-secondary" href={`/api/patients/${patient!.id}/report`}>Download history</a></>} />
    <div className="metric-grid"><MetricCard label="Records" value={(events?.length ?? 0)+(docs?.length ?? 0)} hint="Care events + documents" icon={FileText} tone="blue"/><MetricCard label="Events" value={events?.length ?? 0} hint="Chronological journey" icon={ClipboardList} tone="teal"/><MetricCard label="Care gaps" value={activeGaps.length} hint="Items to verify" icon={TriangleAlert} tone={activeGaps.length?'amber':'green'}/><MetricCard label="Appointments" value={apps?.filter((a:any)=>!['CANCELLED','COMPLETED'].includes(a.status)).length ?? 0} hint="Scheduled / active" icon={CalendarClock} tone="blue"/></div>

    <section className="panel patient-mini-profile" style={{marginTop:18}}><div className="mini-profile"><div className="patient-avatar">{patient?.full_name.split(' ').map((x:string)=>x[0]).slice(0,2).join('')}</div><div><div className="eyebrow">PATIENT MASTER PROFILE</div><h2>{patient?.full_name}</h2><p>{patient?.patient_code} · {patient?.gender} · {calculateAge(patient!.dob)} years · {patient?.mobile}</p></div></div><div className="security-pill"><ShieldCheck size={14}/> Your portal only sees the linked patient record</div></section>
    {latestReport ? <section className="panel ai-summary-panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Latest care summary</h2><p>{new Date(latestReport.created_at).toLocaleString('en-IN')}</p></div><StatusBadge tone="teal">AI-assisted</StatusBadge></div><div className="summary-body"><h3>{(latestReport.content as any).headline}</h3><p>{(latestReport.content as any).overview}</p><div className="summary-next"><strong>Documented next actions</strong>{((latestReport.content as any).next_actions || []).map((x:string)=><div key={x}>• {x}</div>)}</div><div className="notice notice-amber" style={{marginTop:12}}><span>{(latestReport.content as any).disclaimer}</span></div></div></section> : null}

    <div className="dashboard-grid" style={{marginTop:18}}>
      <section className="panel panel-large"><div className="panel-head"><div><h2>Full care timeline</h2><p>Chronological events from authoritative admin records and patient submissions.</p></div><Link className="panel-link" href="/patient/timeline">View full timeline →</Link></div><Timeline events={(events ?? []).slice(0,6)} /></section>
    </div>

    <div className="dashboard-grid" style={{marginTop:18}}><section className="panel"><div className="panel-head"><div><h2>Continuity alerts</h2><p>Workflow gaps for you and your care team to review.</p></div></div><div className="gap-list">{activeGaps.length ? activeGaps.map((gap:any)=><GapCard key={gap.id} gap={gap}/>) : <div className="empty-mini"><ShieldCheck size={17}/><span>No unresolved continuity alerts.</span></div>}</div></section><section className="panel"><div className="panel-head"><div><h2>Upcoming care</h2><p>Appointments connected to your record.</p></div></div><div className="appointment-list">{apps?.filter((a:any)=>a.status!=='CANCELLED').slice(0,4).map((a:any)=><div className="appointment-card" key={a.id}><div><div className="appointment-date">{a.appointment_date} · {a.appointment_time.slice(0,5)}</div><strong>{a.department}</strong><span>{a.clinician} · {a.reason}</span></div><StatusBadge tone={a.status==='SCHEDULED'?'blue':a.status==='COMPLETED'?'green':'amber'}>{a.status}</StatusBadge></div>)}</div></section></div>

    <div style={{marginTop:18}}><DocumentUploadForm patientId={patient!.id} events={(events ?? []).map((e:any)=>({id:e.id,title:e.title,event_date:e.event_date}))}/></div>

    <div className="quick-links-grid" style={{marginTop:18}}><QuickLink href="/patient/assistant" title="CareMesh AI" description="Ask about your own record and navigate your care journey." icon={Sparkles}/><QuickLink href="/patient/timeline" title="My timeline" description="Filter events by type and source." icon={ClipboardList}/><QuickLink href="/patient/documents" title="My documents" description="Review uploads and secure downloads." icon={FileText}/><QuickLink href="/patient/appointments" title="Appointments" description="Book, reschedule and view your schedule." icon={CalendarClock}/></div>
  </>;
}
