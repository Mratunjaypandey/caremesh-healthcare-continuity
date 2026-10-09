'use client';

import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function InvitePatientButton({ patientId }: { patientId: string }) {
  const [loading, setLoading] = useState(false);
  async function invite() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/patients/${patientId}/invite`, { method:'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed.');
      toast.success('Patient portal invitation sent.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invite failed.');
    } finally { setLoading(false); }
  }
  return <button className="btn btn-secondary" onClick={invite} disabled={loading}>{loading?<Loader2 size={15} className="spin"/>:<Mail size={15}/>} {loading?'Sending…':'Portal invite'}</button>;
}
