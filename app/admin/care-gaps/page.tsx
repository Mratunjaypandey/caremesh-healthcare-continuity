import Link from 'next/link';
import { TriangleAlert, CheckCircle2 } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveCareGap } from '@/app/actions';
import { PageHeader, GapCard, StatusBadge } from '@/components/ui';

export default async function AdminCareGapsPage() {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  const supabase = await createClient();
  const { data: gaps } = await supabase.from('care_gaps').select('*,patients(full_name,patient_code)').eq('org_id', user.orgId).neq('status','RESOLVED').order('severity').order('created_at',{ascending:false});
  return <>
    <PageHeader eyebrow="Continuity engine" title="Care gaps" description="Rule-based workflow findings for human review — not medical diagnosis." actions={<Link className="btn btn-secondary" href="/admin">Back to overview</Link>} />
    <div className="notice notice-amber"><TriangleAlert size={17}/><div><strong>Safety boundary</strong><p>Care gaps identify missing documentation, appointments and workflow inconsistencies. They do not diagnose or recommend treatment.</p></div></div>
    <section className="panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Open findings</h2><p>Source event IDs are retained for traceability.</p></div><StatusBadge tone={gaps?.length ? 'red' : 'green'}>{gaps?.length ?? 0} open</StatusBadge></div>{gaps?.length ? <div className="gap-list">{gaps.map((gap:any)=><div key={gap.id} className="gap-row"><GapCard gap={gap}/><div className="gap-row-actions"><Link href={`/admin/patients/${gap.patient_id}`} className="btn btn-small btn-secondary">Review {gap.patients?.patient_code}</Link><form action={resolveCareGap}><input type="hidden" name="id" value={gap.id}/><button className="btn btn-small btn-success"><CheckCircle2 size={14}/> Resolve</button></form></div></div>)}</div> : <div className="empty-state"><div className="empty-icon"><CheckCircle2 size={22}/></div><h3>No open gaps</h3><p>The continuity engine is not flagging unresolved workflow issues.</p></div>}</section>
  </>;
}
