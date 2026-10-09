import Link from 'next/link';
import { Search, UserPlus, ShieldCheck } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { registerPatient } from '@/app/actions';
import { PageHeader, StatusBadge } from '@/components/ui';
import { calculateAge } from '@/lib/utils';

export default async function PatientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const { q = '' } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from('patients').select('id,patient_code,full_name,gender,dob,mobile,email,consent_recorded,created_at').eq('org_id', user.orgId).order('created_at',{ascending:false});
  if (q.trim()) {
    const like = `%${q.trim()}%`;
    query = query.or(`full_name.ilike.${like},patient_code.ilike.${like},mobile.ilike.${like}`);
  }
  const { data: patients, error } = await query.limit(100);

  return <>
    <PageHeader eyebrow="Patient directory" title="Patients" description="Organization-scoped master profiles and source-linked longitudinal records." actions={<a href="#register" className="btn btn-primary"><UserPlus size={16}/> Register patient</a>} />
    <section className="panel" id="directory">
      <div className="panel-head"><div><h2>Registered patients</h2><p>Search by normalized mobile, name or patient ID.</p></div><StatusBadge tone="blue">{patients?.length ?? 0} results</StatusBadge></div>
      <form className="search-form" method="get"><div className="search-input"><Search size={16}/><input name="q" defaultValue={q} placeholder="Search patient name, mobile or ID" /></div><button className="btn btn-secondary">Search</button>{q ? <Link href="/admin/patients" className="btn btn-secondary">Clear</Link> : null}</form>
      {error ? <div className="form-error" style={{marginTop:12}}>{error.message}</div> : null}
      <div className="table-scroll" style={{marginTop:14}}><table className="data-table"><thead><tr><th>Patient</th><th>Mobile</th><th>Age / gender</th><th>Consent</th><th>Created</th><th></th></tr></thead><tbody>{patients?.map((patient:any)=><tr key={patient.id}><td><div className="table-strong">{patient.full_name}</div><div className="table-muted">{patient.patient_code}</div></td><td>{patient.mobile}<div className="table-muted">{patient.email ?? 'No email'}</div></td><td>{calculateAge(patient.dob)} yrs · {patient.gender}</td><td>{patient.consent_recorded ? <StatusBadge tone="green">Recorded</StatusBadge> : <StatusBadge tone="amber">Pending</StatusBadge>}</td><td>{new Date(patient.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td><td><Link href={`/admin/patients/${patient.id}`} className="btn btn-small btn-secondary">Open record</Link></td></tr>)}</tbody></table></div>
    </section>

    <section className="panel" id="register" style={{marginTop:18}}>
      <div className="panel-head"><div><h2>Register first visit</h2><p>Create the master profile. Duplicate mobile numbers are blocked within the organization.</p></div><ShieldCheck size={19}/></div>
      <form action={registerPatient} className="form-grid">
        <label>Full name<input name="full_name" required placeholder="Patient full name" /></label>
        <label>Gender<select name="gender" defaultValue="Prefer not to say"><option>Male</option><option>Female</option><option>Other</option><option>Prefer not to say</option></select></label>
        <label>Date of birth<input name="dob" type="date" required /></label>
        <label>Mobile<input name="mobile" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required placeholder="10-digit mobile" /></label>
        <label>Email<input name="email" type="email" placeholder="patient@example.com" /></label>
        <label>Emergency contact<input name="emergency_contact" placeholder="Name · Mobile" /></label>
        <label className="full">Address<textarea name="address" rows={2} placeholder="Address / locality" /></label>
        <label className="checkbox-row full"><input type="checkbox" name="consent_recorded" value="true" /> <span>Consent preference recorded in the master profile.</span></label>
        <div className="full form-actions"><button className="btn btn-primary">Create patient profile</button><a className="btn btn-secondary" href="#directory">Back to directory</a></div>
      </form>
    </section>
  </>;
}
