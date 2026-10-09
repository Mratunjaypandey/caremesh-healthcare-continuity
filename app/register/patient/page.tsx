'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function PatientRegistrationContent() {
  const searchParams = useSearchParams();
  const linking = searchParams.get('link') === '1';
  const [form, setForm] = useState({ name: '', mobile: '', email: searchParams.get('email') || '', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(''); setSuccess('');
    const supabase = createClient();
    try {
      const { data: existing } = await supabase.auth.getSession();
      if (!existing.session) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { full_name: form.name.trim(), mobile: form.mobile } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setSuccess('Account created. Confirm your email, then sign in and return here to complete the patient-record link.');
          return;
        }
      }

      const { data: linked, error: linkError } = await supabase.rpc('link_patient_account', { p_mobile: form.mobile });
      if (linkError) throw linkError;
      if (!linked) throw new Error('No eligible CareMesh patient record matched this registered mobile and account email. Ask the hospital/lab admin to verify the master record.');

      window.location.href = '/patient';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create or link the patient account.');
    } finally { setLoading(false); }
  }

  return <main className="simple-auth-page"><div className="simple-auth-card"><div className="brand-inline"><div className="brand-mark">CM</div><div><strong>CareMesh</strong><span>Patient Portal</span></div></div><div className="auth-heading"><div className="eyebrow">{linking ? 'LINK EXISTING ACCOUNT' : 'PATIENT PORTAL REGISTRATION'}</div><h1>{linking ? 'Link your patient record' : 'Claim your patient record'}</h1><p>Use the same email and mobile number already registered by the hospital or lab.</p></div><form className="auth-fields" onSubmit={submit}><label>Full name<input required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} placeholder="Full name as registered"/></label><label>Registered mobile<input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={form.mobile} onChange={(e)=>setForm({...form,mobile:e.target.value.replace(/\D/g,'')})} placeholder="10-digit mobile"/></label><label>Email used at registration<input type="email" required value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} placeholder="you@example.com"/></label>{!linking ? <label>Create password<input type="password" minLength={8} required value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})} autoComplete="new-password"/></label> : null}{error?<div className="form-error">{error}</div>:null}{success?<div className="success-box"><CheckCircle2 size={16}/>{success}</div>:null}<button className="btn btn-primary btn-wide" disabled={loading}>{loading?'Working…':<>{linking?'Link patient record':'Create patient portal'} <ArrowRight size={16}/></>}</button></form><div className="auth-security"><ShieldCheck size={14}/><span>Linking requires the registered email and mobile. Admin-authored clinical records cannot be modified by the patient portal.</span></div><Link href="/login" className="text-link">← Back to sign in</Link></div></main>;
}


export default function PatientRegistrationPage() {
  return (
    <Suspense fallback={<main className="simple-auth-page"><div className="simple-auth-card"><div className="brand-inline"><div className="brand-mark">CM</div><div><strong>CareMesh</strong><span>Patient Portal</span></div></div><div className="auth-heading"><div className="eyebrow">PATIENT PORTAL</div><h1>Loading registration…</h1><p>Preparing your secure patient portal.</p></div></div></main>}>
      <PatientRegistrationContent />
    </Suspense>
  );
}
