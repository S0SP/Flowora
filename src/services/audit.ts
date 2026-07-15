/**
 * Flowora — Audit log service.
 * Append audit_log rows for security-sensitive actions.
 * Non-blocking — failures are swallowed to not break the main flow.
 */

import { createAdminClient } from '@/lib/supabase/server'

export type AuditAction =
  | 'member.invite' | 'member.remove' | 'member.role_change' | 'member.suspend'
  | 'workspace.settings_update' | 'workspace.delete'
  | 'credential.created' | 'credential.deleted' | 'credential.rotated'
  | 'api_key.created' | 'api_key.deleted'
  | 'billing.plan_change' | 'billing.topup'
  | 'contact.bulk_delete' | 'contact.export'
  | 'campaign.sent' | 'campaign.cancelled'
  | 'workflow.activated' | 'workflow.deleted'
  | 'chatbot.settings_update'
  | 'voice.clone_created' | 'voice.clone_deleted'
  | 'security.2fa_enabled' | 'security.2fa_disabled'
  | 'export.contacts' | 'export.analytics'

export interface AuditParams {
  workspaceId: string
  userId: string
  action: AuditAction
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Append an audit log row. Never throws — failures are logged only.
 */
export async function audit(params: AuditParams): Promise<void> {
  try {
    const admin = await createAdminClient()
    await admin.from('audit_log').insert({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      metadata: params.metadata ?? {},
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    })
  } catch (err) {
    console.error('[audit] failed to write audit log', err)
  }
}

/**
 * Extract IP and User-Agent from a NextRequest for audit logging.
 */
export function getRequestMeta(req: Request): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0]!.trim(),
    userAgent: req.headers.get('user-agent') ?? 'unknown',
  }
}
