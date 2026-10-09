import Link from 'next/link';
import { Bell, Check, Circle } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { markAllNotificationsRead, markNotificationRead } from '@/app/actions';
import { PageHeader, StatusBadge } from '@/components/ui';

export default async function PatientNotifications() {
  const user = await requireRole(['PATIENT']);
  const supabase = await createClient();
  const { data: notifications } = await supabase.from('notifications').select('*').eq('patient_id', user.patientId!).order('created_at',{ascending:false}).limit(100);
  const unread = notifications?.filter((n:any)=>!n.read_at).length ?? 0;
  return <>
    <PageHeader eyebrow="Patient notifications" title="Notifications" description="Minimum necessary previews. Detailed record content requires authenticated access." actions={<form action={markAllNotificationsRead}><button className="btn btn-secondary"><Check size={15}/> Mark all read</button></form>} />
    <section className="panel"><div className="panel-head"><div><h2>Notification history</h2><p>Lab reports, appointment changes, instructions and document review updates.</p></div><StatusBadge tone={unread?'red':'green'}>{unread} unread</StatusBadge></div><div className="notification-list">{notifications?.map((n:any)=><div className={`notification-card ${n.read_at?'notification-read':''}`} key={n.id}><div className="notification-card-icon"><Bell size={16}/></div><div className="notification-card-content"><div className="notification-card-head"><strong>{n.title}</strong>{n.read_at ? <StatusBadge tone="green">Read</StatusBadge> : <StatusBadge tone="blue">New</StatusBadge>}</div><p>{n.message}</p><span>{new Date(n.created_at).toLocaleString('en-IN')}</span></div>{!n.read_at ? <form action={markNotificationRead}><input type="hidden" name="id" value={n.id}/><button className="icon-btn" title="Mark read"><Check size={15}/></button></form> : null}</div>)}</div></section>
    <div className="notice notice-blue" style={{marginTop:14}}><Circle size={14}/><span>Notifications do not include detailed medical values or sensitive content in the preview.</span></div>
  </>;
}
