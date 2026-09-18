/**
 * Flowora — Tenant resolution helpers.
 */

import { cookies, headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const WORKSPACE_COOKIE = 'fw_ws'

export interface TenantContext {
  userId: string
  workspaceId: string
  role: string
  permissions: Record<string, Record<string, boolean>>
}

export async function getTenant(): Promise<TenantContext> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new TenantError('Unauthenticated', 401)
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value

  if (!workspaceId) {
    throw new TenantError('No active workspace — complete onboarding', 400)
  }

  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('role, permissions')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (memberError && memberError.code !== 'PGRST116') {
    console.error('getTenant member fetch error:', memberError)
  }

  if (!member) {
    console.error('getTenant NO MEMBER FOUND:', { workspaceId, userId: user.id })
    throw new TenantError('Not a member of this workspace', 403)
  }

  return {
    userId: user.id,
    workspaceId,
    role: member.role,
    permissions: (member.permissions as Record<string, Record<string, boolean>>) ?? {},
  }
}

export async function withTenant(
  handler: (ctx: TenantContext) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const ctx = await getTenant()
    return await handler(ctx)
  } catch (err) {
    if (err instanceof TenantError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[tenant] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export function hasPermission(
  ctx: TenantContext,
  module: string,
  action: 'read' | 'write' = 'read'
): boolean {
  if (ctx.role === 'owner' || ctx.role === 'admin') return true
  return ctx.permissions[module]?.[action] === true
}

export function requirePermission(ctx: TenantContext, module: string, action: 'read' | 'write' = 'read') {
  if (!hasPermission(ctx, module, action)) {
    throw new TenantError(`Insufficient permissions: ${module}.${action}`, 403)
  }
}

/**
 * After auth, resolve the user's active workspace and set fw_ws cookie.
 * 
 * KEY CHANGE: We now consider ANY user with an active workspace_members row
 * as "onboarded" — we do NOT require workspaces.onboarding_completed to be true.
 * The onboarding_completed flag is best-effort and can lag due to race conditions
 * between the client setting document.cookie and the server PATCH response.
 */
export async function resolveWorkspaceForMiddleware(
  request: NextRequest,
  userId: string,
  response: NextResponse
): Promise<NextResponse> {
  let workspaceId = request.cookies.get(WORKSPACE_COOKIE)?.value

  const admin = await createAdminClient()

  // Validate the cookie workspace_id if present
  let validMembership = false;
  if (workspaceId) {
    const { data: check } = await admin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()
    if (check) validMembership = true;
  }

  if (!workspaceId || !validMembership) {
    // Find first active workspace for this user
    const { data: membership } = await admin
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!membership) {
      // No workspace at all — redirect to onboarding
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }

    // Set the cookie and continue — do NOT check onboarding_completed on workspace row
    response.cookies.set(WORKSPACE_COOKIE, membership.workspace_id, { path: '/', httpOnly: false, sameSite: 'lax' })
  }

  return response
}

export class TenantError extends Error {
  constructor(
    message: string,
    public readonly status: number = 403
  ) {
    super(message)
    this.name = 'TenantError'
  }
}
