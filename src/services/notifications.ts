/**
 * Flowora — Notifications service.
 * Create notification rows + push via Supabase Realtime.
 * The client subscribes to notifications filtered by workspace_id.
 */

import { createAdminClient } from '@/lib/supabase/server'

export type NotificationType =
  | 'new_message'
  | 'conversation_assigned'
  | 'campaign_completed'
  | 'workflow_error'
  | 'workflow_completed'
  | 'voice_call_ended'
  | 'credits_low'
  | 'credits_exhausted'
  | 'member_joined'
  | 'member_removed'
  | 'integration_error'
  | 'knowledge_indexed'
  | 'voice_clone_ready'
  | 'ticket_assigned'

export interface CreateNotificationParams {
  workspaceId: string
  /** Who receives the notification. null = all workspace members */
  userId?: string
  type: NotificationType
  title: string
  body?: string
  link?: string
  metadata?: Record<string, unknown>
}

/**
 * Create a notification row. Supabase Realtime fan-out handles push to client.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const admin = await createAdminClient()
    
    let userIds = [params.userId]
    if (!params.userId) {
      // fetch all active members
      const { data: members } = await admin
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', params.workspaceId)
      
      if (members) {
        userIds = members.map((m: any) => m.user_id)
      }
    }

    const inserts = userIds.filter(Boolean).map(uid => {
      const dataPayload = { ...(params.metadata || {}) }
      if (params.link) {
        dataPayload.link = params.link
      }
      
      return {
        workspace_id: params.workspaceId,
        user_id: uid,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        data: dataPayload,
      }
    })

    if (inserts.length > 0) {
      const { error } = await admin.from('notifications').insert(inserts)
      if (error) console.error('[notifications] insert error', error)
    }
  } catch (err) {
    console.error('[notifications] failed to create notification', err)
  }
}

/**
 * Mark all unread notifications for a user as read.
 */
export async function markAllRead(workspaceId: string, userId: string): Promise<void> {
  const admin = await createAdminClient()
  await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .is('read_at', null)
}

// Predefined notification helpers -------------------------------------------

export const Notify = {
  creditsLow: (workspaceId: string, balance: number) =>
    createNotification({
      workspaceId,
      type: 'credits_low',
      title: 'Credits running low',
      body: `Your AI credit balance is ${balance.toLocaleString()}. Top up to avoid interruptions.`,
      link: '/dashboard/billing',
    }),

  creditsExhausted: (workspaceId: string) =>
    createNotification({
      workspaceId,
      type: 'credits_exhausted',
      title: 'AI credits exhausted',
      body: 'You have 0 AI credits remaining. Upgrade your plan or buy a credit pack.',
      link: '/dashboard/billing',
    }),

  campaignCompleted: (workspaceId: string, campaignName: string, sent: number, failed: number) =>
    createNotification({
      workspaceId,
      type: 'campaign_completed',
      title: `Campaign "${campaignName}" completed`,
      body: `${sent} sent · ${failed} failed`,
      link: '/dashboard/campaigns',
    }),

  workflowError: (workspaceId: string, workflowName: string, runId: string) =>
    createNotification({
      workspaceId,
      type: 'workflow_error',
      title: `Workflow "${workflowName}" failed`,
      body: 'Click to view the error details and retry.',
      link: `/dashboard/workflows?run=${runId}`,
    }),

  voiceCloneReady: (workspaceId: string, userId: string, voiceName: string) =>
    createNotification({
      workspaceId,
      userId,
      type: 'voice_clone_ready',
      title: 'Voice clone ready',
      body: `"${voiceName}" has been cloned and is ready to use in your voice agents.`,
      link: '/dashboard/voice-agent',
    }),

  knowledgeIndexed: (workspaceId: string, docName: string) =>
    createNotification({
      workspaceId,
      type: 'knowledge_indexed',
      title: 'Document indexed',
      body: `"${docName}" is now searchable in your knowledge base.`,
      link: '/dashboard/knowledge',
    }),

  conversationAssigned: (workspaceId: string, userId: string, assignerName: string) =>
    createNotification({
      workspaceId,
      userId,
      type: 'conversation_assigned',
      title: 'Conversation Assigned',
      body: `${assignerName} assigned a conversation to you.`,
      link: '/dashboard/inbox',
    }),

  conversationAssignedToOther: (workspaceId: string, assignerId: string, assigneeName: string) =>
    createNotification({
      workspaceId,
      userId: assignerId,
      type: 'conversation_assigned',
      title: 'Conversation Assigned',
      body: `You assigned a conversation to ${assigneeName}.`,
      link: '/dashboard/inbox',
    }),

  ticketAssigned: (workspaceId: string, userId: string, assignerName: string, ticketSubject: string, ticketId: string) =>
    createNotification({
      workspaceId,
      userId,
      type: 'ticket_assigned',
      title: 'Ticket Assigned',
      body: `${assignerName} assigned ticket "${ticketSubject}" to you.`,
      link: `/dashboard/tickets/${ticketId}`,
    }),

  ticketAssignedToOther: (workspaceId: string, assignerId: string, assigneeName: string, ticketSubject: string, ticketId: string) =>
    createNotification({
      workspaceId,
      userId: assignerId,
      type: 'ticket_assigned',
      title: 'Ticket Assigned',
      body: `You assigned ticket "${ticketSubject}" to ${assigneeName}.`,
      link: `/dashboard/tickets/${ticketId}`,
    }),
}
