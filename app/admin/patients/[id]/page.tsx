import Link from 'next/link';
import { ArrowLeft, FilePlus2, CalendarClock, UserRound, Download, ClipboardPlus, CheckCircle2, Pencil, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addCareEvent, createAppointment, reviewDocument, updatePatient, updateCareEvent } from '@/app/actions';
import { calculateAge } from '@/lib/utils';
import { computeCareGaps } from '@/lib/care-gaps';
import { PageHeader, PatientHero, Timeline, StatusBadge, GapCard } from '@/components/ui';
import { GenerateSummaryButton } from '@/components/generate-summary-button';
import { DocumentDownloadButton } from '@/components/document-download-button';
import { InvitePatientButton } from '@/components/invite-patient-button';
import { DocumentUploadForm } from '@/components/document-upload-form';

export default async function PatientRecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ summary?: string }> }) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const { id } = await params;
  const { summary: summaryId } = await searchParams;
  const supabase = await createClient();

  const [{ data: patient }, { data: events }, { data: docs }, { data: appointments }, { data: gaps }, { data: latestReport }] = await Promise.all([
    supabase.from('patients').select('*').eq('id', id).eq('org_id', user.orgId).maybeSingle(),
    supabase.from('care_events').select('*').eq('patient_id', id).order('event_date',{ascending:false}).order('event_time',{ascending:false}),
    supabase.from('documents').select('*').eq('patient_id', id).order('created_at',{ascending:false}),
    supabase.from('appointments').select('*').eq('patient_id', id).order('appointment_date').order('appointment_time'),
    supabase.from('care_gaps').select('*').eq('patient_id', id).neq('status','RESOLVED').order('created_at',{ascending:false}),
    supabase.from('reports').select('id,content,created_at,model').eq('patient_id', id).eq('report_type','AI_HISTORY').order('created_at',{ascending:false}).limit(1).maybeSingle(),
  ]);
  if (!patient) notFound();

  const computed = computeCareGaps(events ?? [], appointments ?? [], docs ?? []);
  const activeGaps = gaps?.length ? gaps : computed.map((g, i) => ({ id: `computed-${i}`, ...g }));

  return <>
    <PageHeader eyebrow="Patient record" title={patient.full_name} description={`${patient.patient_code} · ${patient.gender} · ${calculateAge(patient.dob)} years · ${patient.mobile}`} actions={<Link className="btn btn-secondary" href="/admin/patients"><ArrowLeft size={15}/> Directory</Link>} />

    <PatientHero patient={patient} actions={<><GenerateSummaryButton patientId={patient.id} variant="dark" /><InvitePatientButton patientId={patient.id}/><a className="btn btn-light-dark" href={`/api/patients/${patient.id}/report`}>Download report <Download size={15}/></a></>} />

    {summaryId && latestReport?.id === summaryId ? <section className="panel ai-summary-panel"><div className="panel-head"><div><h2>AI-assisted history summary</h2><p>Generated {new Date(latestReport.created_at).toLocaleString('en-IN')}</p></div><StatusBadge tone="teal">Source-backed</StatusBadge></div><div className="summary-body"><h3>{(latestReport.content as any).headline}</h3><p>{(latestReport.content as any).overview}</p><div className="summary-grid"><div><h4>Timeline highlights</h4>{((latestReport.content as any).timeline_highlights || []).map((x:any)=><div className="summary-item" key={x.date+x.title}><strong>{x.date} · {x.title}</strong><span>{x.summary}</span><small>Sources: {x.source_event_ids.join(', ')}</small></div>)}</div><div><h4>Continuity gaps</h4>{((latestReport.content as any).continuity_gaps || []).map((x:any)=><div className="summary-item" key={x.type}><strong>{x.type}</strong><span>{x.description}</span><small>Sources: {x.source_event_ids.join(', ') || 'Rule-derived'}</small></div>)}</div></div><div className="summary-next"><strong>Documented next actions</strong>{((latestReport.content as any).next_actions || []).map((x:string)=><div key={x}>• {x}</div>)}</div><div className="notice notice-amber" style={{marginTop:12}}><span>{(latestReport.content as any).disclaimer}</span></div></div></section> : null}

    <section className="panel correction-panel">
      <div className="panel-head"><div><div className="eyebrow">CONTROLLED EDITING</div><h2>Correct patient information</h2><p>Use authorized corrections when a demographic or contact detail was entered incorrectly. Every change is audited.</p></div><ShieldCheck size={19}/></div>
      <form action={updatePatient} className="form-grid">
        <input type="hidden" name="patient_id" value={patient.id}/>
        <label>Full name<input name="full_name" defaultValue={patient.full_name} required/></label>
        <label>Gender<select name="gender" defaultValue={patient.gender}><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
        <label>Date of birth<input name="dob" type="date" defaultValue={patient.dob} required/></label>
        <label>Mobile<input name="mobile" inputMode="numeric" defaultValue={patient.mobile} required/></label>
        <label>Email<input name="email" type="email" defaultValue={patient.email || ''}/></label>
        <label>Emergency contact<input name="emergency_contact" defaultValue={patient.emergency_contact || ''}/></label>
        <label className="full">Address<input name="address" defaultValue={patient.address || ''}/></label>
        <label>Consent recorded<select name="consent_recorded" defaultValue={patient.consent_recorded ? 'true' : 'false'}><option value="true">Yes</option><option value="false">Pending</option></select></label>
        <div className="full form-actions"><button className="btn btn-primary"><Pencil size={14}/> Save corrected patient details</button></div>
      </form>
    </section>

    <div className="record-layout">
      <div className="record-main">
        <section className="panel"><div className="panel-head"><div><h2>Longitudinal timeline</h2><p>Authoritative care records and patient submissions remain source-labeled.</p></div><StatusBadge tone="blue">{events?.length ?? 0} events</StatusBadge></div><Timeline events={(events ?? []).map((event:any)=>({...event, author_name: event.author_role}))} /></section>

        <section className="panel" style={{marginTop:18}}>
          <div className="panel-head"><div><h2>Appointment schedule</h2><p>Reschedule, correct details or update status without losing the audit history.</p></div><StatusBadge tone="green">{appointments?.length ?? 0}</StatusBadge></div>
          <div className="appointment-list">
            {appointments?.map((a:any)=><details className="appointment-card appointment-edit-card" key={a.id}>
              <summary className="appointment-summary">
                <div><div className="appointment-date">{a.appointment_date} · {String(a.appointment_time).slice(0,5)}</div><strong>{a.department}</strong><span>{a.clinician} · {a.reason}</span></div>
                <div className="inline-actions"><StatusBadge tone={a.status==='SCHEDULED'?'blue':a.status==='COMPLETED'?'green':a.status==='CANCELLED'?'red':'amber'}>{a.status}</StatusBadge><Pencil size={14}/></div>
              </summary>
              <form action={createAppointment} className="form-grid compact-form appointment-edit-form">
                <input type="hidden" name="id" value={a.id}/><input type="hidden" name="patient_id" value={patient.id}/>
                <label>Date<input name="appointment_date" type="date" defaultValue={a.appointment_date} required/></label>
                <label>Time<input name="appointment_time" type="time" defaultValue={String(a.appointment_time).slice(0,5)} required/></label>
                <label>Department<input name="department" defaultValue={a.department} required/></label>
                <label>Clinician<input name="clinician" defaultValue={a.clinician} required/></label>
                <label>Status<select name="status" defaultValue={a.status}><option>SCHEDULED</option><option>RESCHEDULED</option><option>COMPLETED</option><option>CANCELLED</option><option>NO_SHOW</option></select></label>
                <label>Reason<input name="reason" defaultValue={a.reason} required/></label>
                <label className="full">Notes<textarea name="notes" rows={2} defaultValue={a.notes || ''}/></label>
                <div className="full form-actions"><button className="btn btn-secondary"><RotateIcon/> Save appointment changes</button></div>
              </form>
            </details>)}
          </div>
        </section>
      </div>

      <aside className="record-side">
        <section className="panel"><div className="panel-head"><div><h2>Care gaps</h2><p>Continuity rules for human review.</p></div><StatusBadge tone={activeGaps.length ? 'red' : 'green'}>{activeGaps.length}</StatusBadge></div><div className="gap-list">{activeGaps.length ? activeGaps.map((gap:any)=><GapCard gap={gap} key={gap.id}/>) : <div className="empty-mini"><CheckCircle2 size={17}/><span>No unresolved gaps.</span></div>}</div></section>
        <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Documents</h2><p>Private storage with role-aware access.</p></div><StatusBadge tone="blue">{docs?.length ?? 0}</StatusBadge></div><div className="document-list">{docs?.map((doc:any)=><div className="document-row" key={doc.id}><FilePlus2 size={16}/><div className="min-w-0"><strong>{doc.file_name}</strong><span>{doc.document_type} · {doc.source_role}</span></div><DocumentDownloadButton documentId={doc.id}/></div>)}</div></section>
      </aside>
    </div>

    <div className="dashboard-grid" style={{marginTop:18}}>
      <section className="panel"><div className="panel-head"><div><div className="eyebrow">ADD RECORD</div><h2>Add care event</h2><p>Authorized admin/clinician mutation with full attribution.</p></div><ClipboardPlus size={18}/></div><form action={addCareEvent} className="form-grid"><input type="hidden" name="patient_id" value={patient.id}/><label>Type<select name="event_type"><option>OPD</option><option>ADMISSION</option><option>LAB</option><option>FOLLOW_UP</option><option>BILLING</option><option>DOCUMENT</option></select></label><label>Status<select name="event_status"><option>COMPLETED</option><option>FINAL</option><option>PENDING</option><option>SCHEDULED</option><option>IN_PROGRESS</option></select></label><label>Date<input type="date" name="event_date" required defaultValue={new Date().toISOString().slice(0,10)}/></label><label>Time<input type="time" name="event_time"/></label><label>Department<input name="department" defaultValue="General Medicine"/></label><label>Clinician<input name="clinician" defaultValue={user.fullName}/></label><label className="full">Title<input name="title" required placeholder="OPD review / CBC report / follow-up"/></label><label className="full">Summary<textarea name="summary" rows={3} placeholder="Source-backed documentation only"/></label><label className="full">Prescription / documented instruction<textarea name="prescription" rows={2}/></label><label>Next follow-up<input type="date" name="next_follow_up"/></label><div className="full form-actions"><button className="btn btn-primary">Save event</button></div></form></section>

      <section className="panel"><div className="panel-head"><div><h2>Correct a care event</h2><p>Edit an existing record when the source entry contains an error. Changes remain in the audit trail.</p></div><SlidersHorizontal size={18}/></div><div className="event-edit-list">{events?.map((event:any)=><details className="event-edit-row" key={event.id}><summary><span><strong>{event.title}</strong><small>{event.event_date} · {event.event_type}</small></span><Pencil size={14}/></summary><form action={updateCareEvent} className="form-grid compact-form"><input type="hidden" name="id" value={event.id}/><input type="hidden" name="patient_id" value={patient.id}/><label>Type<select name="event_type" defaultValue={event.event_type}><option>OPD</option><option>ADMISSION</option><option>LAB</option><option>FOLLOW_UP</option><option>BILLING</option><option>DOCUMENT</option><option>APPOINTMENT</option></select></label><label>Status<select name="event_status" defaultValue={event.event_status || 'COMPLETED'}><option>PLANNED</option><option>SCHEDULED</option><option>IN_PROGRESS</option><option>COMPLETED</option><option>FINAL</option><option>CANCELLED</option><option>PENDING</option><option>RESCHEDULED</option></select></label><label>Date<input type="date" name="event_date" defaultValue={event.event_date}/></label><label>Time<input type="time" name="event_time" defaultValue={event.event_time ? String(event.event_time).slice(0,5) : ''}/></label><label>Department<input name="department" defaultValue={event.department || ''}/></label><label>Clinician<input name="clinician" defaultValue={event.clinician || ''}/></label><label className="full">Title<input name="title" defaultValue={event.title || ''} required/></label><label className="full">Summary<textarea name="summary" rows={3} defaultValue={event.summary || ''}/></label><label className="full">Documented instruction<textarea name="prescription" rows={2} defaultValue={event.prescription || ''}/></label><label>Next follow-up<input type="date" name="next_follow_up" defaultValue={event.next_follow_up || ''}/></label><div className="full form-actions"><button className="btn btn-secondary"><Pencil size={14}/> Save event correction</button></div></form></details>)}</div></section>
    </div>

    <div style={{marginTop:18}}><DocumentUploadForm patientId={patient.id} events={(events ?? []).map((e:any)=>({id:e.id,title:e.title,event_date:e.event_date}))}/></div>
    <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Document review</h2><p>Patient-submitted documents stay under controlled review.</p></div><UserRound size={18}/></div><div className="table-scroll"><table className="data-table"><thead><tr><th>File</th><th>Type</th><th>Source</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>{docs?.map((doc:any)=><tr key={doc.id}><td><div className="table-strong">{doc.file_name}</div><div className="table-muted">{doc.mime_type}</div></td><td>{doc.document_type}</td><td>{doc.source_role}</td><td><StatusBadge tone={doc.status==='ACCEPTED'||doc.status==='FINAL'?'green':doc.status==='REJECTED'?'red':'amber'}>{doc.status}</StatusBadge></td><td>{new Date(doc.created_at).toLocaleString('en-IN')}</td><td><div className="inline-actions"><DocumentDownloadButton documentId={doc.id}/>{doc.status==='SUBMITTED' ? <><form action={reviewDocument}><input type="hidden" name="id" value={doc.id}/><input type="hidden" name="status" value="ACCEPTED"/><button className="btn btn-small btn-success">Accept</button></form><form action={reviewDocument}><input type="hidden" name="id" value={doc.id}/><input type="hidden" name="status" value="REJECTED"/><button className="btn btn-small btn-danger">Reject</button></form></> : null}</div></td></tr>)}</tbody></table></div></section>
  </>;
}

function RotateIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 0 0-15.2-6.5L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.2 6.5L21 16"/><path d="M21 21v-5h-5"/></svg>;
}
