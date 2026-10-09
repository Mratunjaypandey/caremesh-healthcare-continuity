'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setMessage('If an account exists for this email, a password reset link has been sent.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start password reset.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="simple-auth-page">
      <div className="simple-auth-card">
        <div className="brand-inline"><div className="brand-mark">CM</div><div><strong>CareMesh</strong><span>Secure account recovery</span></div></div>
        <div className="auth-heading"><div className="eyebrow">PASSWORD RECOVERY</div><h1>Reset your password</h1><p>Enter the email associated with your CareMesh account.</p></div>
        <form className="auth-fields" onSubmit={submit}>
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          {error ? <div className="form-error">{error}</div> : null}
          {message ? <div className="success-box"><CheckCircle2 size={16} />{message}</div> : null}
          <button className="btn btn-primary btn-wide" disabled={loading}>{loading ? 'Sending…' : <>Send reset link <ArrowRight size={16} /></>}</button>
        </form>
        <div className="auth-security"><ShieldCheck size={14} /><span>Password reset is handled by Supabase Auth and never exposes the existing password to CareMesh.</span></div>
        <Link href="/login" className="text-link">← Back to sign in</Link>
      </div>
    </main>
  );
}
