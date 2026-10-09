import Link from 'next/link';
import { ShieldCheck, Activity } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, StatusBadge } from '@/components/ui';

export default async function AuditPage() {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const supabase = await createClient();
  const { data: audit } = await supabase.from('audit_log').select('*').eq('org_id', user.orgId).order('created_at',{ascending:false}).limit(250);
  return <>
    <PageHeader eyebrow="Accountability" title="Audit trail" description="Create, update, review and access events are attributed to an actor, role and timestamp." actions={<Link className="btn btn-secondary" href="/admin">Back to overview</Link>} />
    <section className="panel"><div className="panel-head"><div><h2>Immutable-style activity history</h2><p>Application writes are preserved as an audit event after important mutations.</p></div><ShieldCheck size={19}/></div><div className="table-scroll"><table className="data-table"><thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Action</th><th>Entity</th><th>Metadata</th></tr></thead><tbody>{audit?.map((row:any)=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString('en-IN')}</td><td><div className="table-strong">{row.actor_id?.slice(0,8) ?? 'System'}</div></td><td><StatusBadge tone={row.actor_role==='PATIENT'?'teal':'blue'}>{row.actor_role ?? 'SYSTEM'}</StatusBadge></td><td><div className="table-strong">{row.action}</div></td><td>{row.entity_type}<div className="table-muted">{row.entity_id?.slice(0,8) ?? '—'}</div></td><td><code>{JSON.stringify(row.metadata ?? {})}</code></td></tr>)}</tbody></table></div></section>
    <div className="mini-note" style={{marginTop:12}}><Activity size={14}/><span>For a regulated deployment, keep audit retention, export and tamper-evidence policies aligned to your organization's legal and compliance requirements.</span></div>
  </>;
}
