'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole, Save } from 'lucide-react';
import { toast } from 'sonner';
import { updateProfile } from '@/app/actions';
import { createClient } from '@/lib/supabase/client';

export function ProfileForm({ user }: { user: { fullName: string; email: string | null; mobile?: string | null } }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  async function save(formData: FormData) {
    setSaving(true);
    try {
      await updateProfile(formData);
      toast.success('Profile updated.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update profile.');
    } finally { setSaving(false); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return toast.error('Use a password with at least 8 characters.');
    if (password !== confirm) return toast.error('Passwords do not match.');
    setChangingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setConfirm('');
      toast.success('Password updated successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to change password.');
    } finally { setChangingPassword(false); }
  }

  return (
    <div className="profile-settings-grid">
      <section className="panel profile-card">
        <div className="panel-head"><div><h2>Personal details</h2><p>Keep your portal profile accurate and easy to identify.</p></div></div>
        <form onSubmit={(event) => { event.preventDefault(); save(new FormData(event.currentTarget)); }} className="form-grid profile-form">
          <label>Full name<input name="full_name" defaultValue={user.fullName} required maxLength={120}/></label>
          <label>Email<input value={user.email || ''} readOnly disabled/></label>
          <label>Mobile<input name="mobile" defaultValue={user.mobile || ''} inputMode="numeric" maxLength={10} placeholder="10-digit mobile"/></label>
          <div className="profile-save"><button className="btn btn-primary" disabled={saving}><Save size={15}/>{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </section>

      <section className="panel profile-card">
        <div className="panel-head"><div><h2>Account security</h2><p>Change your password without leaving CareMesh.</p></div></div>
        <form onSubmit={changePassword} className="auth-fields profile-form">
          <label>New password<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={8} autoComplete="new-password"/></label>
          <label>Confirm password<input type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} minLength={8} autoComplete="new-password"/></label>
          <button className="btn btn-secondary" disabled={changingPassword}><LockKeyhole size={15}/>{changingPassword ? 'Updating…' : 'Update password'}</button>
        </form>
      </section>
    </div>
  );
}
