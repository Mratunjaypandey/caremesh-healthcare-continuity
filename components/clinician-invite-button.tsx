'use client';

import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ClinicianInviteButton({ clinicianId, linked }: { clinicianId: string; linked: boolean }) {
  const [loading, setLoading] = useState(false);

  async function invite() {
    if (linked || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/team/${clinicianId}/invite`, { method: 'POST' });
      const text = await response.text();
      let data: any = {};
      if (text) {
        try { data = JSON.parse(text); } catch { data = { error: text }; }
      }
      if (!response.ok) throw new Error(data.error || `Invitation failed (${response.status}).`);
      toast.success(data.message || 'Clinician invitation sent.');
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Clinician invitation failed.');
    } finally {
      setLoading(false);
    }
  }

  return <button type="button" className="btn btn-secondary btn-small" onClick={invite} disabled={loading || linked}>
    {loading ? <Loader2 size={13} className="spin" /> : <Mail size={13} />}
    {loading ? 'Sending…' : linked ? 'Portal linked' : 'Invite portal'}
  </button>;
}
