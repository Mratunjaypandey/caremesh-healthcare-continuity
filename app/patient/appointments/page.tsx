import Link from 'next/link';
import { CalendarClock, Bell, Plus, RefreshCcw, XCircle } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { bookPatientAppointment, managePatientAppointment } from '@/app/actions';
import { PageHeader, StatusBadge } from '@/components/ui';

export default async function PatientAppointments() {
  const user = await requireRole(['PATIENT']);
  const supabase = await createClient();
  const [{ data: appointments }, { data: departments }, { data: clinicians }] = await Promise.all([
    supabase.from('appointments').select('*').eq('patient_id', user.patientId!).order('appointment_date').order('appointment_time'),
    supabase.from('departments').select('id,name').eq('org_id', user.orgId).eq('is_active', true).order('name'),
    supabase.from('clinicians').select('id,full_name,title,department_id,departments(name)').eq('org_id', user.orgId).eq('is_active', true).order('full_name'),
  ]);

  const active = (appointments ?? []).filter((a: any) => a.status !== 'CANCELLED');

  return <>
    <PageHeader
      eyebrow="Appointment lifecycle"
      title="Appointments"
      description="Book new visits, keep your schedule organized and reschedule when your plans change."
      actions={<Link className="btn btn-secondary" href="/patient/notifications"><Bell size={15}/> Notifications</Link>}
    />

    <div className="appointment-layout">
      <section className="panel booking-panel">
        <div className="panel-head">
          <div><div className="eyebrow">BOOK A VISIT</div><h2>Request an appointment</h2><p>Choose a convenient date, time and care department.</p></div>
          <span className="section-icon section-icon-blue"><Plus size={18}/></span>
        </div>
        <form action={bookPatientAppointment} className="form-grid">
          <label>Date<input name="appointment_date" type="date" required /></label>
          <label>Time<input name="appointment_time" type="time" required /></label>
          <label>Department{departments?.length ? <select name="department" defaultValue="" required><option value="" disabled>Choose a department</option>{departments.map((d:any)=><option key={d.id} value={d.name}>{d.name}</option>)}</select> : <input name="department" placeholder="Enter preferred department" required />}</label>
          <label>Clinician{clinicians?.length ? <select name="clinician" defaultValue="" required><option value="" disabled>Choose a clinician</option>{clinicians.map((c:any)=><option key={c.id} value={c.full_name}>{c.title ? `${c.title} ` : ''}{c.full_name}{c.departments?.name ? ` · ${c.departments.name}` : ''}</option>)}</select> : <input name="clinician" placeholder="Preferred clinician" required />}</label>
          <label className="full">Reason<input name="reason" placeholder="Follow-up / review / consultation" required /></label>
          <label className="full">Notes<textarea name="notes" rows={3} placeholder="Optional context for the care team" /></label>
          <div className="full form-actions"><button className="btn btn-primary"><CalendarClock size={15}/> Book appointment</button></div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Upcoming care</h2><p>Your active schedule, connected to your record.</p></div><StatusBadge tone="blue">{active.length} active</StatusBadge></div>
        <div className="appointment-cards appointment-cards-modern">
          {active.length ? active.map((a:any)=>(
            <article className="appointment-big appointment-modern" key={a.id}>
              <div className="appointment-big-top">
                <div className="appointment-calendar"><CalendarClock size={20}/><div><strong>{a.appointment_date}</strong><span>{String(a.appointment_time).slice(0,5)}</span></div></div>
                <StatusBadge tone={a.status==='SCHEDULED'?'blue':a.status==='COMPLETED'?'green':a.status==='CANCELLED'?'red':'amber'}>{a.status}</StatusBadge>
              </div>
              <div className="appointment-detail"><strong>{a.department}</strong><span>{a.clinician}</span><p>{a.reason}</p>{a.notes ? <div className="appointment-note">{a.notes}</div> : null}</div>
              <div className="table-muted">Last updated {new Date(a.updated_at).toLocaleString('en-IN')}</div>
              {a.status !== 'COMPLETED' ? <details className="appointment-manage">
                <summary><RefreshCcw size={14}/> Reschedule or cancel</summary>
                <form action={managePatientAppointment} className="form-grid compact-form">
                  <input type="hidden" name="id" value={a.id}/>
                  <input type="hidden" name="status" value="RESCHEDULED"/>
                  <label>Date<input type="date" name="appointment_date" defaultValue={a.appointment_date} required/></label>
                  <label>Time<input type="time" name="appointment_time" defaultValue={String(a.appointment_time).slice(0,5)} required/></label>
                  <label className="full">Note<textarea name="notes" rows={2} placeholder="Optional reason for the change"/></label>
                  <div className="full form-actions"><button className="btn btn-secondary"><RefreshCcw size={14}/> Request reschedule</button></div>
                </form>
                <form action={managePatientAppointment} className="inline-danger-form">
                  <input type="hidden" name="id" value={a.id}/><input type="hidden" name="status" value="CANCELLED"/><input type="hidden" name="appointment_date" value={a.appointment_date}/><input type="hidden" name="appointment_time" value={a.appointment_time}/>
                  <button className="btn btn-small btn-danger"><XCircle size={13}/> Cancel appointment</button>
                </form>
              </details> : null}
            </article>
          )) : <div className="empty-state"><div className="empty-icon"><CalendarClock size={21}/></div><h3>No upcoming appointments</h3><p>Use the booking form to schedule your next visit.</p></div>}
        </div>
      </section>
    </div>

    <section className="panel appointment-history-panel">
      <div className="panel-head"><div><h2>Appointment history</h2><p>Completed and cancelled appointments stay visible for continuity.</p></div></div>
      <div className="appointment-history-list">
        {(appointments ?? []).filter((a:any)=>a.status==='COMPLETED' || a.status==='CANCELLED' || a.status==='NO_SHOW').map((a:any)=>(
          <div className="history-row" key={a.id}><div><strong>{a.appointment_date} · {String(a.appointment_time).slice(0,5)}</strong><span>{a.department} · {a.clinician}</span></div><StatusBadge tone={a.status==='COMPLETED'?'green':a.status==='CANCELLED'?'red':'amber'}>{a.status}</StatusBadge></div>
        ))}
        {!((appointments ?? []).some((a:any)=>['COMPLETED','CANCELLED','NO_SHOW'].includes(a.status))) ? <div className="empty-mini"><CalendarClock size={16}/><span>No previous appointment activity yet.</span></div> : null}
      </div>
    </section>
  </>;
}
