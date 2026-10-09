import { getSessionUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser();
  if (!actor || actor.role !== 'ADMIN') {
    return Response.json({ error: 'Only organization administrators can invite clinicians.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: clinician, error: clinicianError } = await supabase
      .from('clinicians')
      .select('id,org_id,auth_user_id,full_name,email,is_active')
      .eq('id', id)
      .eq('org_id', actor.orgId)
      .maybeSingle();

    if (clinicianError) throw new Error(clinicianError.message);
    if (!clinician) return Response.json({ error: 'Clinician not found.' }, { status: 404 });
    if (!clinician.is_active) return Response.json({ error: 'Reactivate this directory entry before inviting the clinician.' }, { status: 409 });
    if (clinician.auth_user_id) return Response.json({ error: 'This clinician already has a linked portal account.' }, { status: 409 });
    if (!clinician.email) return Response.json({ error: 'Add an email address to this clinician first.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: existingProfile, error: existingError } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', clinician.email)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existingProfile) {
      return Response.json({ error: 'A CareMesh account already uses this email. Use a new address or link the account through your identity-administration workflow.' }, { status: 409 });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(clinician.email, {
      redirectTo: `${appUrl}/`,
      data: { full_name: clinician.full_name, caremesh_role: 'CLINICIAN', org_id: actor.orgId },
    });
    if (inviteError || !invite.user) {
      return Response.json({ error: inviteError?.message || 'Supabase did not create the invitation.' }, { status: 502 });
    }

    const invitedUserId = invite.user.id;
    const { error: profileError } = await admin.from('profiles').upsert({
      id: invitedUserId,
      full_name: clinician.full_name,
      email: clinician.email,
    }, { onConflict: 'id' });
    if (profileError) throw new Error(`Invitation created but profile setup failed: ${profileError.message}`);

    const { error: membershipError } = await admin.from('organization_memberships').insert({
      org_id: actor.orgId,
      user_id: invitedUserId,
      role: 'CLINICIAN',
      status: 'active',
    });
    if (membershipError) throw new Error(`Invitation created but membership setup failed: ${membershipError.message}`);

    const { error: linkError } = await admin.from('clinicians').update({ auth_user_id: invitedUserId })
      .eq('id', clinician.id).eq('org_id', actor.orgId).is('auth_user_id', null);
    if (linkError) throw new Error(`Invitation created but clinician linking failed: ${linkError.message}`);

    await writeAudit({
      orgId: actor.orgId,
      actorId: actor.id,
      actorRole: actor.role,
      action: 'Invited clinician portal account',
      entityType: 'clinician',
      entityId: clinician.id,
      metadata: { email: clinician.email },
    });

    return Response.json({ ok: true, message: `Invitation sent to ${clinician.email}.` });
  } catch (error) {
    console.error('Clinician invite failed:', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Clinician invitation failed.' }, { status: 500 });
  }
}
