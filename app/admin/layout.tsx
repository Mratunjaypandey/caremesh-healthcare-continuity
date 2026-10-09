import { requireRole } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['ADMIN','CLINICIAN']);
  return <AppShell user={user}>{children}</AppShell>;
}
