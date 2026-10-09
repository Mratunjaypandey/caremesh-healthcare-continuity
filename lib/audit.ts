import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/auth';

export async function writeAudit(input: {
  orgId: string;
  actorId: string;
  actorRole: AppRole;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from('audit_log').insert({
    org_id: input.orgId,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`Audit logging failed: ${error.message}`);
}
