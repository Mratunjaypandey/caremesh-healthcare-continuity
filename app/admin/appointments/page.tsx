import Link from 'next/link';
import { CalendarClock, ArrowUpRight, Pencil, RotateCcw } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAppointment } from '@/app/actions';
import { PageHeader, StatusBadge } from '@/components/ui';

export default async function AdminAppointmentsPage() {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const supabase = await createClient();
  const [{ data: appointments }, { data: patients }, { data: departments }, { data: clinicians }] = await Promise.all([
    supabase.from('appointments').select('*,patients(full_name,patient_code)').eq('org_id', user.orgId).order('appointment_date').order('appointment_time').limit(200),
    supabase.from('patients').select('id,full_name,patient_code').eq('org_id', user.orgId).order('full_name'),
    supabase.from('departments').select('id,name').eq('org_id', user.orgId).eq('is_active', true).order('name'),
    supabase.from('clinicians').select('id,full_name,title,department_id,departments(name)').eq('org_id', user.orgId).eq('is_active', true).order('full_name'),
  ]);

  return <>
    <PageHeader eyebrow="Appointment lifecycle" title="Appointments" description="Schedule, reschedule, correct and close appointments while keeping the patient timeline synchronized." actions={<Link className="btn btn-secondary" href="/admin">Back to overview</Link>} />

    <div className="appointment-admin-layout">
      <section className="panel appointment-create-panel">
        <div className="panel-head"><div><div className="eyebrow">SCHEDULE CARE</div><h2>Create appointment</h2><p>Patients receive an in-app notification automatically.</p></div><span className="section-icon section-icon-blue"><CalendarClock size={18}/></span></div>
        <form action={createAppointment} className="form-grid">
          <label className="full">Patient<select name="patient_id" required>{patients?.map((p:any)=><option key={p.id} value={p.id}>{p.full_name} · {p.patient_code}</option>)}</select></label>
          <label>Date<input name="appointment_date" type="date" required/></label>
          <label>Time<input name="appointment_time" type="time" required/></label>
          <label>Department{departments?.length ? <select name="department" required defaultValue=""><option value="" disabled>Select department</option>{departments.map((d:any)=><option key={d.id} value={d.name}>{d.name}</option>)}</select> : <input name="department" placeholder="Enter department" required/>}</label>
          <label>Clinician{clinicians?.length ? <select name="clinician" required defaultValue=""><option value="" disabled>Select clinician</option>{clinicians.map((c:any)=><option key={c.id} value={c.full_name}>{c.title ? `${c.title} ` : ''}{c.full_name}{c.departments?.name ? ` · ${c.departments.name}` : ''}</option>)}</select> : <input name="clinician" placeholder="Enter clinician name" required/>}</label>
          <label>Status<select name="status"><option>SCHEDULED</option><option>RESCHEDULED</option><option>COMPLETED</option><option>CANCELLED</option><option>NO_SHOW</option></select></label>
          <label>Reason<input name="reason" placeholder="Follow-up / review" required/></label>
          <label className="full">Notes<textarea name="notes" rows={3}/></label>
          <div className="full form-actions"><button className="btn btn-primary"><CalendarClock size={15}/> Create appointment</button></div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Appointment registry</h2><p>Edit dates, times, clinicians, notes and statuses without losing the audit trail.</p></div><StatusBadge tone="blue">{appointments?.length ?? 0}</StatusBadge></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Date / time</th><th>Patient</th><th>Department</th><th>Clinician</th><th>Status</th><th>Reason</th><th></th></tr></thead><tbody>{appointments?.map((a:any)=><tr key={a.id}>
          <td><div className="table-strong">{a.appointment_date}</div><div className="table-muted">{String(a.appointment_time).slice(0,5)}</div></td>
          <td><div className="table-strong">{a.patients?.full_name}</div><div className="table-muted">{a.patients?.patient_code}</div></td>
          <td>{a.department}</td><td>{a.clinician}</td>
          <td><StatusBadge tone={a.status==='SCHEDULED'?'blue':a.status==='COMPLETED'?'green':a.status==='CANCELLED'?'red':'amber'}>{a.status}</StatusBadge></td>
          <td>{a.reason}</td>
          <td><div className="inline-actions"><Link href={`/admin/patients/${a.patient_id}`} className="icon-btn" title="Open patient"><ArrowUpRight size={15}/></Link><details className="table-edit-menu"><summary className="icon-btn" title="Edit appointment"><Pencil size={15}/></summary><div className="table-edit-popover"><div className="eyebrow">EDIT APPOINTMENT</div><form action={createAppointment} className="form-grid compact-form">
            <input type="hidden" name="id" value={a.id}/><input type="hidden" name="patient_id" value={a.patient_id}/>
            <label>Date<input name="appointment_date" type="date" defaultValue={a.appointment_date} required/></label><label>Time<input name="appointment_time" type="time" defaultValue={String(a.appointment_time).slice(0,5)} required/></label>
            <label>Department{departments?.length ? <select name="department" defaultValue={a.department} required>{!departments.some((d:any)=>d.name===a.department) ? <option value={a.department}>{a.department} · current</option> : null}{departments.map((d:any)=><option key={d.id} value={d.name}>{d.name}</option>)}</select> : <input name="department" defaultValue={a.department} required/>}</label><label>Clinician{clinicians?.length ? <select name="clinician" defaultValue={a.clinician} required>{!clinicians.some((c:any)=>c.full_name===a.clinician) ? <option value={a.clinician}>{a.clinician} · current</option> : null}{clinicians.map((c:any)=><option key={c.id} value={c.full_name}>{c.title ? `${c.title} ` : ''}{c.full_name}{c.departments?.name ? ` · ${c.departments.name}` : ''}</option>)}</select> : <input name="clinician" defaultValue={a.clinician} required/>}</label>
            <label>Status<select name="status" defaultValue={a.status}><option>SCHEDULED</option><option>RESCHEDULED</option><option>COMPLETED</option><option>CANCELLED</option><option>NO_SHOW</option></select></label><label>Reason<input name="reason" defaultValue={a.reason} required/></label>
            <label className="full">Notes<textarea name="notes" rows={2} defaultValue={a.notes || ''}/></label>
            <div className="full form-actions"><button className="btn btn-primary"><RotateCcw size={13}/> Save changes</button></div>
          </form></div></details></div></td>
        </tr>)}</tbody></table></div>
      </section>
    </div>
  </>;
}
