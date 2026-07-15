/**
 * Flowora — Credits service.
 *
 * Credits are an append-only ledger (credit_ledger) with a
 * materialized balance in credit_wallets for fast reads.
 * The wallet is kept in sync by a DB trigger + cached in Redis.
 *
 * Credit costs (per mockup screen):
 *   chatbot_message: 1 credit per AI response
 *   voice_minute:    15 credits per minute of AI voice call
 *   campaign_wa:     2 credits per WhatsApp template message sent
 *   campaign_email:  1 credit per email sent
 *   workflow_ai:     1 credit per AI node execution
 *   embed_chunk:     1 credit per knowledge chunk embedded
 */

import { createAdminClient } from '@/lib/supabase/server'
import { cacheGet, cacheSet, cacheDel, CacheKey } from '@/lib/redis'

// -------------------------------------------------------------------------
// Credit costs
// -------------------------------------------------------------------------

export const CREDIT_COSTS = {
  chatbot_message: 1,
  voice_minute: 15,
  campaign_wa: 2,
  campaign_email: 1,
  workflow_ai: 1,
  embed_chunk: 1,
} as const

export type CreditOperation = keyof typeof CREDIT_COSTS

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Get current credit balance (cached, fast).
 */
export async function getBalance(workspaceId: string): Promise<number> {
  const cached = await cacheGet<number>(CacheKey.creditBalance(workspaceId))
  if (cached !== null) return cached

  const admin = await createAdminClient()
  const { data } = await admin
    .from('credit_wallets')
    .select('balance')
    .eq('workspace_id', workspaceId)
    .single()

  const balance = data?.balance ?? 0
  await cacheSet(CacheKey.creditBalance(workspaceId), balance, 60)
  return balance
}

/**
 * Debit credits for an operation.
 * Checks balance, per-agent limits, then inserts ledger row.
 * Returns { ok: true } or { ok: false, reason }
 */
export async function debitCredits(params: {
  workspaceId: string
  userId?: string
  operation: CreditOperation
  quantity?: number
  meta?: Record<string, unknown>
}): Promise<{ ok: boolean; reason?: string }> {
  const { workspaceId, userId, operation, quantity = 1, meta } = params
  const amount = CREDIT_COSTS[operation] * quantity

  const admin = await createAdminClient()

  // Check balance via DB (authoritative — not cached for this check)
  const { data: wallet } = await admin
    .from('credit_wallets')
    .select('balance')
    .eq('workspace_id', workspaceId)
    .single()

  if (!wallet || wallet.balance < amount) {
    return { ok: false, reason: 'Insufficient credits' }
  }

  // Check per-agent monthly limit if userId provided
  if (userId) {
    const { data: member } = await admin
      .from('workspace_members')
      .select('credit_limit, credits_used')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (member?.credit_limit !== null && member?.credit_limit !== undefined) {
      if ((member.credits_used ?? 0) + amount > member.credit_limit) {
        return { ok: false, reason: 'Agent monthly credit limit reached' }
      }
    }
  }

  // Debit — insert ledger row (DB trigger keeps wallet.balance in sync)
  const { error } = await admin.from('credit_ledger').insert({
    workspace_id: workspaceId,
    user_id: userId ?? null,
    type: 'debit',
    amount,
    operation,
    meta: meta ?? {},
  })

  if (error) {
    console.error('[credits] debit failed', error)
    return { ok: false, reason: 'Database error' }
  }

  // Update agent monthly usage
  if (userId) {
    await admin.rpc('increment_agent_credits_used', { p_workspace_id: workspaceId, p_user_id: userId, p_amount: amount })
  }

  // Invalidate balance cache
  await cacheDel(CacheKey.creditBalance(workspaceId))

  return { ok: true }
}

/**
 * Grant credits (on plan subscription, top-up, or manual override).
 */
export async function grantCredits(params: {
  workspaceId: string
  amount: number
  type: 'subscription_grant' | 'topup' | 'manual' | 'refund'
  meta?: Record<string, unknown>
}): Promise<void> {
  const { workspaceId, amount, type, meta } = params
  const admin = await createAdminClient()

  await admin.from('credit_ledger').insert({
    workspace_id: workspaceId,
    type,
    amount,
    operation: null,
    meta: meta ?? {},
  })

  await cacheDel(CacheKey.creditBalance(workspaceId))
}

/**
 * Check if workspace has enough credits (non-deducting — for UI display).
 */
export async function hasEnoughCredits(workspaceId: string, operation: CreditOperation, quantity = 1): Promise<boolean> {
  const balance = await getBalance(workspaceId)
  return balance >= CREDIT_COSTS[operation] * quantity
}
