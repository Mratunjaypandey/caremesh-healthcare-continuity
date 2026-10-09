import Link from 'next/link';
import { CalendarClock, FilePlus2, TriangleAlert, Users, Activity, ArrowRight, Sparkles, ShieldCheck, Stethoscope } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MetricCard, PageHeader, QuickLink, StatusBadge, GapCard } from '@/components/ui';
import { computeCareGaps } from '@/lib/care-gaps';
import { TimeGreeting } from '@/components/time-greeting';

export default async function AdminDashboard() {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const supabase = await createClient();
  const [{ count: patientCount }, { count: eventCount }, { data: appointments }, { data: recentEvents }, { data: patients }] = await Promise.all([
    supabase.from('patients').select('*', { count: 'exact', head: true }).eq('org_id', user.orgId),
    supabase.from('care_events').select('*', { count: 'exact', head: true }).eq('org_id', user.orgId),
    supabase.from('appointments').select('id,patient_id,appointment_date,appointment_time,department,clinician,status,reason,patients(full_name,patient_code)').eq('org_id', user.orgId).order('appointment_date').order('appointment_time').limit(8),
    supabase.from('care_events').select('id,patient_id,event_type,event_date,event_time,title,summary,department,clinician,source_label').eq('org_id', user.orgId).order('created_at',{ascending:false}).limit(8),
    supabase.from('patients').select('id,patient_code,full_name,mobile,dob').eq('org_id', user.orgId).order('created_at',{ascending:false}).limit(100),
  ]);

  let gapCount = 0;
  for (const patient of patients ?? []) {
    const [{ data: events }, { data: apps }, { data: docs }] = await Promise.all([
      supabase.from('care_events').select('id,event_type,event_status,event_date,event_time,title,summary,next_follow_up,metadata').eq('patient_id', patient.id),
      supabase.from('appointments').select('id,appointment_date,status').eq('patient_id', patient.id),
      supabase.from('documents').select('id,linked_event_id,status').eq('patient_id', patient.id),
    ]);
    gapCount += computeCareGaps(events ?? [], apps ?? [], docs ?? []).length;
  }

  const today = new Date().toISOString().slice(0,10);
  const todayAppointments = (appointments ?? []).filter((a: any) => a.appointment_date === today && a.status !== 'CANCELLED');

  return <>
    <PageHeader eyebrow="Hospital / Lab Admin Portal" title={<TimeGreeting name={user.fullName} />} description="Maintain the authoritative patient record, appointments and continuity workflow." actions={<><Link className="btn btn-secondary" href="/admin/patients#register">Register patient</Link><Link className="btn btn-primary" href="/admin/patients">Open patient directory <ArrowRight size={15}/></Link></>} />

    <div className="metric-grid">
      <MetricCard label="Patients" value={patientCount ?? 0} hint="Registered master profiles" icon={Users} tone="blue" />
      <MetricCard label="Care events" value={eventCount ?? 0} hint="Longitudinal activity" icon={Activity} tone="teal" />
      <MetricCard label="Care gaps" value={gapCount} hint="Items needing review" icon={TriangleAlert} tone={gapCount ? 'amber' : 'green'} />
      <MetricCard label="Appointments" value={appointments?.length ?? 0} hint="Upcoming / active" icon={CalendarClock} tone="blue" />
    </div>

    <div className="dashboard-grid" style={{ marginTop: 18 }}>
      <section className="panel panel-large">
        <div className="panel-head"><div><h2>Patient search</h2><p>Find a patient by mobile number or master patient ID.</p></div><StatusBadge tone="blue">Admin-only lookup</StatusBadge></div>
        <form className="search-form" action="/admin/patients"><input name="q" inputMode="search" placeholder="9876543210 or CM-2026-123456"/><button className="btn btn-primary">Search patients</button></form>
        <div className="quick-links-grid dashboard-quick-links">
          <QuickLink href="/admin/patients" title="Patient directory" description="Browse the organization master registry." icon={Users}/>
          <QuickLink href="/admin/appointments" title="Appointments" description="Create, reschedule and close the loop." icon={CalendarClock}/>
          <QuickLink href="/admin/care-gaps" title="Care gaps" description="Review unresolved continuity findings." icon={TriangleAlert}/>
          <QuickLink href="/admin/team" title="Care team" description="Manage doctors and departments." icon={Stethoscope}/>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Today's work</h2><p>Operational focus</p></div><span className="date-pill">{new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span></div>
        <div className="stack-list">
          <div className="work-item"><div className="work-icon"><CalendarClock size={17}/></div><div><strong>{todayAppointments.length} appointments today</strong><span>Review schedule and patient continuity before the visit.</span></div></div>
          <div className="work-item"><div className="work-icon"><FilePlus2 size={17}/></div><div><strong>{recentEvents?.filter((e:any)=>e.event_type==='LAB').length ?? 0} recent lab records</strong><span>Check final reports and outstanding document status.</span></div></div>
          <div className="work-item"><div className="work-icon"><TriangleAlert size={17}/></div><div><strong>{gapCount} open care-gap findings</strong><span>Rules surface missing follow-ups and workflow inconsistencies.</span></div></div>
        </div>
      </section>
    </div>

    <div className="dashboard-grid" style={{ marginTop: 18 }}>
      <section className="panel panel-large">
        <div className="panel-head"><div><h2>Recent care activity</h2><p>Every important change is attributable to a role and record source.</p></div><Link className="panel-link" href="/admin/audit">Audit trail →</Link></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Event</th><th>Patient</th><th>Source</th><th>Date</th><th></th></tr></thead><tbody>{(recentEvents ?? []).map((event:any)=><tr key={event.id}><td><StatusBadge tone={event.event_type==='LAB'?'teal':event.event_type==='ADMISSION'?'amber':'blue'}>{event.event_type.replaceAll('_',' ')}</StatusBadge><div className="table-strong">{event.title}</div></td><td><div className="table-strong">{patients?.find((p:any)=>p.id===event.patient_id)?.full_name ?? 'Patient'}</div></td><td>{event.source_label}</td><td>{event.event_date}<div className="table-muted">{event.event_time?.slice(0,5) ?? ''}</div></td><td><Link className="btn btn-small btn-secondary" href={`/admin/patients/${event.patient_id}`}>Open</Link></td></tr>)}</tbody></table></div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>AI continuity</h2><p>AI is used for source-backed summarization only.</p></div><Sparkles size={18}/></div>
        <div className="ai-callout"><Sparkles size={19}/><div><strong>Non-diagnostic by design</strong><p>CareMesh uses a structured, privacy-aware timeline for summarization and continuity reporting. Clinical decisions remain with qualified professionals.</p></div></div>
        <div className="mini-note"><ShieldCheck size={14}/><span>Structured outputs, source IDs and server-only API keys.</span></div>
      </section>
    </div>
  </>;
}
