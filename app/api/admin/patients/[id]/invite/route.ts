import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser();
  if (!actor || !['ADMIN','CLINICIAN'].includes(actor.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const supabase = await createClient();
  const { data: patient } = await supabase.from('patients').select('id,org_id,full_name,email,auth_user_id').eq('id', id).maybeSingle();
  if (!patient || patient.org_id !== actor.orgId) return Response.json({ error: 'Patient not found.' }, { status: 404 });
  if (!patient.email) return Response.json({ error: 'The patient has no email address on the master profile.' }, { status: 400 });
  if (patient.auth_user_id) return Response.json({ error: 'This patient already has a linked portal account.' }, { status: 409 });

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(patient.email, { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/` });
  if (error || !data.user) return Response.json({ error: error?.message || 'Invite failed.' }, { status: 500 });
  await admin.from('profiles').upsert({ id: data.user.id, full_name: patient.full_name, email: patient.email }, { onConflict: 'id' });
  const { data: existingMemberships, error: membershipLookupError } = await admin.from('organization_memberships').select('org_id,role,status').eq('user_id', data.user.id);
  if (membershipLookupError) return Response.json({ error: membershipLookupError.message }, { status: 500 });
  const conflicting = existingMemberships?.find((membership) => membership.org_id !== actor.orgId && membership.status === 'active');
  if (conflicting) return Response.json({ error: 'This email already has an active CareMesh membership in another organization.' }, { status: 409 });
  const { error: membershipError } = await admin.from('organization_memberships').upsert({ org_id: actor.orgId, user_id: data.user.id, role: 'PATIENT', status: 'active' }, { onConflict: 'org_id,user_id' });
  if (membershipError) return Response.json({ error: membershipError.message }, { status: 500 });
  await admin.from('patients').update({ auth_user_id: data.user.id }).eq('id', patient.id);
  await writeAudit({ orgId: actor.orgId, actorId: actor.id, actorRole: actor.role, action: 'Sent patient portal invitation', entityType: 'patient', entityId: patient.id });
  return Response.json({ ok: true });
}
