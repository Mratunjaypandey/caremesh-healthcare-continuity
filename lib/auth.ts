import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export type AppRole = 'ADMIN' | 'CLINICIAN' | 'PATIENT';

export type SessionUser = {
  id: string;
  email: string | null;
  role: AppRole;
  orgId: string;
  fullName: string;
  patientId: string | null;
  patientCode: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const [{ data: profile }, { data: membership }, { data: patient }] = await Promise.all([
    supabase.from('profiles').select('full_name,email').eq('id', userId).maybeSingle(),
    supabase.from('organization_memberships').select('org_id,role').eq('user_id', userId).eq('status', 'active').order('created_at').limit(1).maybeSingle(),
    supabase.from('patients').select('id,patient_code').eq('auth_user_id', userId).maybeSingle(),
  ]);

  if (!membership) return null;
  return {
    id: userId,
    email: profile?.email ?? (claimsData?.claims?.email as string | undefined) ?? null,
    role: membership.role as AppRole,
    orgId: membership.org_id,
    fullName: profile?.full_name ?? 'CareMesh User',
    patientId: patient?.id ?? null,
    patientCode: patient?.patient_code ?? null,
  };
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(roles: AppRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect(user.role === 'PATIENT' ? '/patient' : '/admin');
  }
  return user;
}
