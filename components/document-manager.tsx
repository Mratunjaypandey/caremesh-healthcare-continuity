'use client';

import { useMemo, useState } from 'react';
import { Download, FileText, Search, SlidersHorizontal } from 'lucide-react';
import { DocumentDownloadButton } from '@/components/document-download-button';
import { StatusBadge } from '@/components/ui';

type Doc = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  document_type: string;
  source_role: string;
  status: string;
  linked_event_id: string | null;
  created_at: string;
  notes?: string | null;
};

const types = ['ALL', 'Prescription', 'Lab Report', 'Discharge Summary', 'Invoice', 'Other'];

function readableSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function typeTone(type: string) {
  if (type === 'Lab Report') return 'teal';
  if (type === 'Prescription') return 'blue';
  if (type === 'Discharge Summary') return 'amber';
  return 'slate';
}

export function DocumentManager({ documents }: { documents: Doc[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      const matchesFilter = filter === 'ALL' || doc.document_type === filter;
      const matchesQuery = !q || `${doc.file_name} ${doc.document_type} ${doc.status}`.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [documents, query, filter]);

  return (
    <div className="document-manager">
      <div className="document-toolbar document-toolbar-premium">
        <div className="document-search">
          <Search size={15}/>
          <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search documents…" aria-label="Search documents" />
        </div>
        <div className="document-filter-label"><SlidersHorizontal size={14}/> Filters</div>
      </div>

      <div className="document-chips">
        {types.map((type) => <button key={type} className={`filter-chip ${filter === type ? 'filter-chip-active' : ''}`} onClick={() => setFilter(type)}>{type === 'ALL' ? 'All documents' : type}</button>)}
      </div>

      {filtered.length ? (
        <div className="document-grid">
          {filtered.map((doc) => (
            <article className="document-card" key={doc.id}>
              <div className="document-card-top">
                <div className="document-icon"><FileText size={19}/></div>
                <StatusBadge tone={doc.status === 'FINAL' || doc.status === 'ACCEPTED' ? 'green' : doc.status === 'REJECTED' ? 'red' : 'amber'}>{doc.status}</StatusBadge>
              </div>
              <div className="document-name" title={doc.file_name}>{doc.file_name}</div>
              <div className="document-meta"><StatusBadge tone={typeTone(doc.document_type) as any}>{doc.document_type}</StatusBadge><span>{readableSize(doc.size_bytes)}</span></div>
              <div className="document-meta"><span>{doc.source_role === 'PATIENT' ? 'Patient submitted' : 'Care team record'}</span><span>{new Date(doc.created_at).toLocaleDateString('en-IN')}</span></div>
              {doc.notes ? <p className="document-note">{doc.notes}</p> : null}
              <div className="document-actions">
                <DocumentDownloadButton documentId={doc.id} />
                <span className="document-action-label"><Download size={13}/> Secure download</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="document-empty"><FileText size={24}/><strong>No documents match your filters.</strong><span>Try another search or upload a new supporting record.</span></div>
      )}
    </div>
  );
}
