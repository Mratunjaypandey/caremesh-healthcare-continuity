'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setReady(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && (event === 'PASSWORD_RECOVERY' || session)) setReady(true);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!ready) return setError('The reset link is invalid or expired. Please request a new one.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) return setError(updateError.message);
    setMessage('Password updated successfully. You can sign in with your new password.');
  }

  return (
    <main className="simple-auth-page">
      <div className="simple-auth-card">
        <div className="brand-inline"><div className="brand-mark">CM</div><div><strong>CareMesh</strong><span>Secure password update</span></div></div>
        <div className="auth-heading"><div className="eyebrow">ACCOUNT SECURITY</div><h1>Choose a new password</h1><p>Use a strong password you do not reuse elsewhere.</p></div>
        <form className="auth-fields" onSubmit={submit}>
          <label>New password<input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
          <label>Confirm password<input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>
          {error ? <div className="form-error">{error}</div> : null}
          {message ? <div className="success-box"><CheckCircle2 size={16} />{message}</div> : null}
          <button className="btn btn-primary btn-wide" disabled={!ready || Boolean(message)}>{ready && !message ? <>Update password <ArrowRight size={16} /></> : message ? 'Password updated' : 'Waiting for reset link…'}</button>
        </form>
        <div className="auth-security"><ShieldCheck size={14} /><span>Supabase Auth manages the password credential. CareMesh stores no password hashes in application tables.</span></div>
        <Link href="/login" className="text-link">← Back to sign in</Link>
      </div>
    </main>
  );
}
