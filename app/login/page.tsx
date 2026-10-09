'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { FeatureStrip } from '@/components/ui';

export default function LoginPage() {
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => { setNext(new URLSearchParams(window.location.search).get('next')); }, []);
  const [portal, setPortal] = useState<'admin' | 'patient'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;

      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) throw new Error('Authentication succeeded but the user session was not available.');

      const { data: membership, error: membershipError } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at')
        .limit(1)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership) {
        await supabase.auth.signOut();
        window.location.href = `/register/patient?link=1&email=${encodeURIComponent(email.trim())}`;
        return;
      }

      if (portal === 'patient' && membership.role !== 'PATIENT') {
        await supabase.auth.signOut();
        throw new Error('This account is not assigned to the patient portal.');
      }

      if (portal === 'admin' && !['ADMIN', 'CLINICIAN'].includes(membership.role)) {
        await supabase.auth.signOut();
        throw new Error('This account is not assigned to the hospital/lab portal.');
      }

      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      window.location.href = safeNext || (membership.role === 'PATIENT' ? '/patient' : '/admin');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to sign in.');
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-grid">
        <section className="auth-showcase">
          <div className="brand-inline"><div className="brand-mark">CM</div><div><strong>CareMesh</strong><span>Healthcare Continuity Intelligence</span></div></div>
          <div className="auth-copy">
            <div className="eyebrow light">ONE LONGITUDINAL CARE RECORD</div>
            <h1>Don't make patients become the database.</h1>
            <p>Connect OPD, admissions, diagnostics, follow-ups, documents and appointments into one source-linked care journey.</p>
            <FeatureStrip />
          </div>
          <div className="showcase-footer"><span>Production architecture</span><span>Secure infrastructure · AI assistance · role-based access</span></div>
        </section>

        <section className="auth-form-wrap">
          <div className="auth-form-card">
            <div className="mobile-brand"><div className="brand-mark">CM</div><div><strong>CareMesh</strong><span>Continuity Intelligence</span></div></div>
            <div className="auth-heading"><div className="eyebrow">SECURE PORTAL ACCESS</div><h2>Welcome back</h2><p>Use the credentials created for your CareMesh organization.</p></div>
            <div className="portal-switch"><button type="button" className={portal === 'admin' ? 'active' : ''} onClick={() => { setPortal('admin'); setError(''); }}>Hospital / Lab</button><button type="button" className={portal === 'patient' ? 'active' : ''} onClick={() => { setPortal('patient'); setError(''); }}>Patient</button></div>
            <form onSubmit={signIn} className="auth-fields">
              <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="you@example.com" /></label>
              <label>Password<div className="password-field"><input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" minLength={8} placeholder="Your password" /><button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
              {error ? <div className="form-error"><ShieldCheck size={15}/>{error}</div> : null}
              <button className="btn btn-primary btn-wide" disabled={loading}>{loading ? 'Signing in…' : <>Sign in to {portal === 'admin' ? 'Admin Portal' : 'Patient Portal'} <ArrowRight size={16}/></>}</button>
            </form>
            <div className="auth-actions"><Link href="/forgot-password" className="text-link">Forgot password?</Link><Link href="/register/patient" className="text-link">Claim patient portal record →</Link></div>
            <div className="auth-assistant-note"><Sparkles size={15}/><div><strong>CareMesh AI is available after patient sign-in.</strong><span>It can help you navigate your own timeline, appointments and documents using your CareMesh record. It does not provide diagnosis or treatment advice.</span></div></div>
            <div className="auth-security"><LockKeyhole size={14}/><span>Sessions use Supabase Auth. Data access is enforced by PostgreSQL Row-Level Security, not by hidden UI controls.</span></div>
          </div>
        </section>
      </div>
    </main>
  );
}
