import { ShieldCheck, UserRound, Building2 } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatusBadge } from '@/components/ui';
import { ProfileForm } from '@/components/profile-form';
import { initials } from '@/lib/utils';

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: organization }, { data: patient }] = await Promise.all([
    supabase.from('profiles').select('full_name,email,mobile').eq('id', user.id).maybeSingle(),
    supabase.from('organizations').select('name,status').eq('id', user.orgId).maybeSingle(),
    user.patientId ? supabase.from('patients').select('patient_code,email,mobile').eq('id', user.patientId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile & settings" description="Manage your CareMesh account identity, security and portal details. Patient master demographics remain under authorized care-team control." />

      <section className="profile-hero panel">
        <div className="profile-avatar-large">{initials(profile?.full_name || user.fullName)}</div>
        <div className="profile-hero-copy">
          <div className="eyebrow">ACCOUNT PROFILE</div>
          <h2>{profile?.full_name || user.fullName}</h2>
          <p>{profile?.email || user.email || 'Verified CareMesh account'}</p>
          <div className="profile-badges">
            <StatusBadge tone="blue">{user.role}</StatusBadge>
            {organization?.name ? <StatusBadge tone="teal">{organization.name}</StatusBadge> : null}
          </div>
        </div>
        <div className="profile-trust"><ShieldCheck size={17}/><span>Protected by Supabase Auth + database authorization</span></div>
      </section>

      <div className="profile-context-grid">
        <div className="mini-context"><Building2 size={17}/><div><span>Organization</span><strong>{organization?.name || 'Your organization'}</strong></div></div>
        <div className="mini-context"><UserRound size={17}/><div><span>Portal</span><strong>{user.role === 'PATIENT' ? `Patient · ${patient?.patient_code || user.patientCode || 'Linked record'}` : 'Care team'}</strong></div></div>
        <div className="mini-context"><ShieldCheck size={17}/><div><span>Access model</span><strong>Role + row-level security</strong></div></div>
      </div>

      <ProfileForm user={{ fullName: profile?.full_name || user.fullName, email: profile?.email || user.email, mobile: profile?.mobile || patient?.mobile || '' }} />

      <div className="notice notice-amber" style={{marginTop:16}}>
        <strong>Privacy boundary</strong>
        <span>CareMesh AI organizes documented records and helps with navigation. It does not replace a clinician, and account/API secrets never belong in the browser.</span>
      </div>
    </>
  );
}
