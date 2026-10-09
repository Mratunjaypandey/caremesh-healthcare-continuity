import {
  Building2,
  CheckCircle2,
  Plus,
  Stethoscope,
  UsersRound,
  UserRoundCog,
} from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  createDepartment,
  updateDepartment,
  createClinician,
  updateClinician,
} from '@/app/actions';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ClinicianInviteButton } from '@/components/clinician-invite-button';

export const dynamic = 'force-dynamic';

export default async function AdminTeamPage() {
  const user = await requireRole(['ADMIN']);
  const supabase = await createClient();
  const [departmentResult, clinicianResult] = await Promise.all([
    supabase.from('departments').select('*').eq('org_id', user.orgId).order('name'),
    supabase.from('clinicians').select('*,departments(name)').eq('org_id', user.orgId).order('full_name'),
  ]);

  const setupRequired = Boolean(departmentResult.error || clinicianResult.error);
  const departments = departmentResult.data ?? [];
  const clinicians = clinicianResult.data ?? [];

  return <>
    <PageHeader
      eyebrow="Organization settings"
      title="Care team & departments"
      description="Maintain the directory used for appointment scheduling. Add departments, manage clinicians and invite clinicians to their own secure CareMesh accounts."
      actions={<span className="team-admin-badge"><CheckCircle2 size={14}/> Administrator access</span>}
    />

    {setupRequired ? <section className="panel team-migration-notice">
      <div className="team-notice-icon"><Building2 size={20}/></div>
      <div>
        <h2>One-time team setup required</h2>
        <p>Run <code>supabase/patches/004_departments_and_clinicians.sql</code> in your existing Supabase SQL Editor. This is an additive migration; it does not reset or delete patient data.</p>
        <p className="team-query-error">{departmentResult.error?.message || clinicianResult.error?.message}</p>
      </div>
    </section> : <>
      <div className="team-summary-grid">
        <article className="team-summary-card team-summary-indigo"><span className="team-summary-icon"><Building2 size={18}/></span><span className="team-summary-label">Departments</span><strong>{departments.filter((d:any)=>d.is_active).length}</strong><small>Active care areas</small></article>
        <article className="team-summary-card team-summary-teal"><span className="team-summary-icon"><Stethoscope size={18}/></span><span className="team-summary-label">Clinicians</span><strong>{clinicians.filter((c:any)=>c.is_active).length}</strong><small>Active directory entries</small></article>
        <article className="team-summary-card team-summary-blue"><span className="team-summary-icon"><UsersRound size={18}/></span><span className="team-summary-label">Portal accounts</span><strong>{clinicians.filter((c:any)=>c.auth_user_id).length}</strong><small>Linked clinician sign-ins</small></article>
      </div>

      <div className="team-management-grid">
        <section className="panel team-management-panel">
          <div className="panel-head team-panel-head">
            <div className="team-title-line"><span className="team-panel-icon team-panel-icon-indigo"><Building2 size={18}/></span><div><h2>Departments</h2><p>Manage the care areas patients can book.</p></div></div>
            <StatusBadge tone="blue">{departments.length} total</StatusBadge>
          </div>
          <form action={createDepartment} className="form-grid team-create-form">
            <label className="full">Department name<input name="name" placeholder="e.g. Cardiology" required maxLength={120}/></label>
            <label>Short code<input name="code" placeholder="e.g. CARD" maxLength={30}/></label>
            <label>Description<input name="description" placeholder="Optional description" maxLength={500}/></label>
            <div className="full form-actions"><button className="btn btn-primary"><Plus size={15}/> Add department</button></div>
          </form>
          <div className="team-list-heading"><strong>Department directory</strong><span>Deactivation preserves historical records.</span></div>
          <div className="team-directory-list">
            {departments.map((department:any) => <details className="team-directory-item" key={department.id}>
              <summary><span className="team-directory-avatar team-directory-avatar-indigo"><Building2 size={17}/></span><span className="team-directory-copy"><strong>{department.name}</strong><small>{department.code || 'No code'} · {department.is_active ? 'Available for booking' : 'Not available for booking'}</small></span><StatusBadge tone={department.is_active ? 'green' : 'slate'}>{department.is_active ? 'Active' : 'Inactive'}</StatusBadge></summary>
              <form action={updateDepartment} className="form-grid compact-form team-edit-form">
                <input type="hidden" name="id" value={department.id}/>
                <label className="full">Department name<input name="name" defaultValue={department.name} required maxLength={120}/></label>
                <label>Short code<input name="code" defaultValue={department.code || ''} maxLength={30}/></label>
                <label>Status<select name="is_active" defaultValue={String(department.is_active)}><option value="true">Active</option><option value="false">Inactive</option></select></label>
                <label className="full">Description<input name="description" defaultValue={department.description || ''} maxLength={500}/></label>
                <div className="full form-actions"><button className="btn btn-secondary">Save department</button></div>
              </form>
            </details>)}
            {!departments.length ? <div className="team-empty"><Building2 size={22}/><strong>No departments added</strong><span>Add your first department to make the appointment flow easier.</span></div> : null}
          </div>
        </section>

        <section className="panel team-management-panel">
          <div className="panel-head team-panel-head">
            <div className="team-title-line"><span className="team-panel-icon team-panel-icon-teal"><Stethoscope size={18}/></span><div><h2>Clinicians & doctors</h2><p>Directory profiles power clinician selection during booking.</p></div></div>
            <StatusBadge tone="teal">{clinicians.length} total</StatusBadge>
          </div>
          <form action={createClinician} className="form-grid team-create-form">
            <label className="full">Full name<input name="full_name" placeholder="Doctor / clinician name" required maxLength={120}/></label>
            <label>Title<input name="title" defaultValue="Dr." placeholder="Dr. / Prof." maxLength={40}/></label>
            <label>Specialty<input name="specialty" placeholder="e.g. Cardiology" maxLength={120}/></label>
            <label>Email<input name="email" type="email" placeholder="doctor@hospital.com"/></label>
            <label>Mobile<input name="mobile" inputMode="numeric" pattern="[0-9]{10}" placeholder="10-digit mobile"/></label>
            <label className="full">Department<select name="department_id" defaultValue=""><option value="">No department assigned</option>{departments.filter((d:any)=>d.is_active).map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <div className="full form-actions"><button className="btn btn-primary"><Plus size={15}/> Add clinician</button></div>
          </form>
          <div className="team-list-heading"><strong>Clinician directory</strong><span>Invite a portal account when a verified email is available.</span></div>
          <div className="team-directory-list">
            {clinicians.map((clinician:any) => <details className="team-directory-item" key={clinician.id}>
              <summary><span className="team-directory-avatar team-directory-avatar-teal"><Stethoscope size={17}/></span><span className="team-directory-copy"><strong>{clinician.title ? `${clinician.title} ` : ''}{clinician.full_name}</strong><small>{clinician.specialty || 'General clinician'} · {clinician.departments?.name || 'No department'}</small></span><StatusBadge tone={clinician.is_active ? 'green' : 'slate'}>{clinician.is_active ? 'Active' : 'Inactive'}</StatusBadge></summary>
              <div className="team-item-account-line">{clinician.auth_user_id ? <StatusBadge tone="green">Portal linked</StatusBadge> : <StatusBadge tone="slate">Directory only</StatusBadge>}<span>{clinician.email || 'No email recorded'}</span></div>
              <form action={updateClinician} className="form-grid compact-form team-edit-form">
                <input type="hidden" name="id" value={clinician.id}/>
                <label className="full">Full name<input name="full_name" defaultValue={clinician.full_name} required maxLength={120}/></label>
                <label>Title<input name="title" defaultValue={clinician.title || ''} maxLength={40}/></label>
                <label>Specialty<input name="specialty" defaultValue={clinician.specialty || ''} maxLength={120}/></label>
                <label>Email<input name="email" type="email" defaultValue={clinician.email || ''}/></label>
                <label>Mobile<input name="mobile" inputMode="numeric" pattern="[0-9]{10}" defaultValue={clinician.mobile || ''}/></label>
                <label className="full">Department<select name="department_id" defaultValue={clinician.department_id || ''}><option value="">No department assigned</option>{departments.map((d:any)=><option key={d.id} value={d.id}>{d.name}{!d.is_active ? ' (inactive)' : ''}</option>)}</select></label>
                <label className="full">Directory status<select name="is_active" defaultValue={String(clinician.is_active)}><option value="true">Active</option><option value="false">Inactive / suspend linked portal access</option></select></label>
                <div className="full form-actions"><button className="btn btn-secondary">Save clinician</button><ClinicianInviteButton clinicianId={clinician.id} linked={Boolean(clinician.auth_user_id)}/></div>
              </form>
            </details>)}
            {!clinicians.length ? <div className="team-empty"><Stethoscope size={22}/><strong>No clinicians added</strong><span>Create directory profiles so appointments can be assigned to the right care team.</span></div> : null}
          </div>
        </section>
      </div>
      <div className="notice notice-blue team-privacy-note"><UserRoundCog size={16}/><p><strong>Access control:</strong> only organization administrators can manage this directory and invite clinician accounts. Deactivating a clinician suspends their linked clinician membership; appointment and care-history entries remain preserved for auditability.</p></div>
    </>}
  </>;
}
