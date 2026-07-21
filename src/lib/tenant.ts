/**
 * Flowora — Tenant resolution helpers.
 *
 * Every server-side operation (API routes, server actions, RSC) MUST call
 * getWorkspaceId() to get the active workspace. This is the single source
 * of tenant context — never pass workspace_id from the client body directly.
 *
 * Flow:
 *   1. Read Supabase JWT → auth.uid()
 *   2. Look up workspace_members for the active workspace stored in cookie fw_ws
 *   3. If no valid membership, throw 403
 *
 * The middleware sets the `fw_ws` cookie on login/workspace switch.
 */

import { cookies, headers } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const WORKSPACE_COOKIE = 'fw_ws'

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export interface TenantContext {
  userId: string
  workspaceId: string
  role: string
  permissions: Record<string, Record<string, boolean>>
}

// -------------------------------------------------------------------------
// Get tenant context (use in Route Handlers and Server Components)
// -------------------------------------------------------------------------

/**
 * Resolve the current user + workspace context.
 * Throws if unauthenticated or not a member of the requested workspace.
 */
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

  // Verify membership (RLS will double-enforce, but we need role/permissions)
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

/**
 * Get tenant context for API route handlers — returns a NextResponse 
 * error response instead of throwing, for cleaner route code.
 */
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

// -------------------------------------------------------------------------
// Permission helpers
// -------------------------------------------------------------------------

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

// -------------------------------------------------------------------------
// Middleware helpers (called from middleware.ts)
// -------------------------------------------------------------------------

/**
 * After auth, check if the user has completed onboarding.
 * If not, redirect to /onboarding.
 * Also set the fw_ws cookie to the user's first workspace if not already set.
 */
export async function resolveWorkspaceForMiddleware(
  request: NextRequest,
  userId: string,
  response: NextResponse
): Promise<NextResponse> {
  let workspaceId = request.cookies.get(WORKSPACE_COOKIE)?.value

  // Use admin client to query workspace membership (bypasses RLS in middleware)
  const admin = await createAdminClient()

  let validMembership = false;
  if (workspaceId) {
    const { data: check } = await admin
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()
    if (check) validMembership = true;
  }

  if (!workspaceId || !validMembership) {
    // Find first active workspace for this user
    const { data: membership } = await admin
      .from('workspace_members')
      .select('workspace_id, workspaces(onboarding_completed)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (!membership) {
      // No workspace — redirect to onboarding
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }

    const ws = membership.workspaces as unknown as { onboarding_completed: boolean } | null
    if (!ws?.onboarding_completed) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      const redirect = NextResponse.redirect(url)
      redirect.cookies.set(WORKSPACE_COOKIE, membership.workspace_id, { path: '/', httpOnly: true, sameSite: 'lax' })
      return redirect
    }

    // Set the cookie and continue
    response.cookies.set(WORKSPACE_COOKIE, membership.workspace_id, { path: '/', httpOnly: true, sameSite: 'lax' })
  }

  return response
}

// -------------------------------------------------------------------------
// Error type
// -------------------------------------------------------------------------

export class TenantError extends Error {
  constructor(
    message: string,
    public readonly status: number = 403
  ) {
    super(message)
    this.name = 'TenantError'
  }
}
