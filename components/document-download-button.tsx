'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function DocumentDownloadButton({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(false);
  async function download() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/download`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create a secure link.');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Download failed.');
    } finally {
      setLoading(false);
    }
  }
  return <button className="icon-btn" onClick={download} aria-label="Download document" title="Secure download" disabled={loading}>{loading ? <Loader2 size={15} className="spin"/> : <Download size={15}/>}</button>;
}
