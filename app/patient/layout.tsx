import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['PATIENT']);
  const supabase = await createClient();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', user.patientId!)
    .is('read_at', null);
  return <AppShell user={{ ...user, unreadNotifications: count ?? 0 } as any}>{children}</AppShell>;
}
