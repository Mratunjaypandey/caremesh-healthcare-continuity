'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function GenerateSummaryButton({ patientId, variant = 'default' }: { patientId: string; variant?: 'default' | 'dark' }) {
  const [loading, setLoading] = useState(false);

  async function run() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ patientId }),
      });
      const raw = await res.text();
      let data: any = {};
      if (raw.trim()) {
        try { data = JSON.parse(raw); } catch { data = { error: raw }; }
      }
      if (!res.ok) throw new Error(data.error || `AI summary request failed (${res.status}).`);
      toast.success('Care summary generated.');
      window.location.href = `/admin/patients/${patientId}?summary=${encodeURIComponent(data.reportId)}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI summary failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" className={`btn ${variant === 'dark' ? 'btn-light-dark' : 'btn-secondary'}`} onClick={run} disabled={loading} aria-busy={loading}>
      {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
      {loading ? 'Generating…' : 'AI summary'}
    </button>
  );
}
