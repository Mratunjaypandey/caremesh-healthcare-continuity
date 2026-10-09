'use client';

import { useRef, useState } from 'react';
import { CloudUpload, FileText, Loader2, Paperclip, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';

export function DocumentUploadForm({ patientId, events }: { patientId: string; events: Array<{ id: string; title: string; event_date: string }> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState('Prescription');
  const [linkedEventId, setLinkedEventId] = useState('');
  const [notes, setNotes] = useState('');

  function choose(next: File | null) {
    if (!next) return;
    if (next.size > 10 * 1024 * 1024) {
      toast.error('File is larger than 10 MB.');
      return;
    }
    setFile(next);
  }

  async function submit() {
    if (!file) return toast.error('Choose a document first.');
    const body = new FormData();
    body.append('file', file);
    body.append('patientId', patientId);
    body.append('documentType', type);
    body.append('linkedEventId', linkedEventId);
    body.append('notes', notes);
    setLoading(true);
    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      toast.success('Document uploaded securely.');
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally { setLoading(false); }
  }

  return <section className="upload-card upload-card-premium panel" aria-labelledby="document-upload-title">
    <div className="upload-card-header">
      <div className="upload-card-brand"><span className="upload-icon upload-icon-gradient"><CloudUpload size={19}/></span><div><div className="eyebrow">PRIVATE DOCUMENT VAULT</div><h3 id="document-upload-title">Upload a supporting record</h3><p>PDF, JPG, PNG or TXT · maximum 10 MB · private signed access.</p></div></div>
      <span className="upload-secure-pill"><ShieldCheck size={13}/> Secure</span>
    </div>

    <div
      className={`upload-dropzone ${dragging ? 'upload-dropzone-active' : ''} ${file ? 'upload-dropzone-selected' : ''}`}
      onDragOver={(e)=>{e.preventDefault();setDragging(true)}}
      onDragLeave={()=>setDragging(false)}
      onDrop={(e)=>{e.preventDefault();setDragging(false);choose(e.dataTransfer.files?.[0] ?? null)}}
      onClick={()=>ref.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ref.current?.click()}}}
    >
      <input ref={ref} type="file" hidden accept="application/pdf,image/jpeg,image/png,text/plain" onChange={(e)=>choose(e.target.files?.[0] ?? null)}/>
      {file ? <div className="upload-file-preview"><span className="upload-file-icon"><FileText size={18}/></span><div className="upload-file-info"><strong>{file.name}</strong><span>{(file.size/1024/1024).toFixed(2)} MB · Ready to upload</span></div><button type="button" className="icon-btn" onClick={(e)=>{e.stopPropagation();setFile(null);if(ref.current)ref.current.value='';}} aria-label="Remove selected file"><X size={16}/></button></div> : <><div className="upload-drop-icon"><CloudUpload size={24}/></div><strong>Drop a file here</strong><span>or tap to browse from your device</span><small>Private storage · authenticated access only</small></>}
    </div>

    <div className="form-grid upload-form-grid">
      <label>Document type<select value={type} onChange={(e)=>setType(e.target.value)}><option>Prescription</option><option>Lab Report</option><option>Discharge Summary</option><option>Invoice</option><option>Other</option></select></label>
      <label>Link to timeline event<select value={linkedEventId} onChange={(e)=>setLinkedEventId(e.target.value)}><option value="">No link</option>{events.map((e)=><option key={e.id} value={e.id}>{e.event_date} · {e.title}</option>)}</select></label>
      <label className="full">Notes<textarea rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Optional context for the care team"/></label>
    </div>

    <div className="upload-card-footer"><div className="upload-help"><Paperclip size={14}/><span>Linking a file to an event helps keep the timeline organized.</span></div><button type="button" className="btn btn-primary" onClick={submit} disabled={loading || !file}>{loading ? <Loader2 size={15} className="spin"/> : <CloudUpload size={15}/>} {loading ? 'Uploading…' : 'Upload securely'}</button></div>
  </section>;
}
