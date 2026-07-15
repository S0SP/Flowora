/**
 * Flowora — QStash client (Upstash durable queue).
 * Used for: campaign fan-out, workflow delays, lead-sync cron, embed jobs.
 *
 * Install: npm install @upstash/qstash
 * Env: QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY
 */

import { Client, Receiver } from '@upstash/qstash'
import { NextRequest } from 'next/server'

// -------------------------------------------------------------------------
// Publisher (enqueue jobs)
// -------------------------------------------------------------------------

let _client: Client | null = null

function getClient(): Client {
  if (_client) return _client
  const token = process.env.QSTASH_TOKEN
  if (!token) {
    console.warn('[qstash] QSTASH_TOKEN not set — jobs will be logged and triggered locally (dev mode)')
    // Return a mock client that logs and triggers the local endpoint directly
    return {
      publishJSON: async (opts: any) => {
        console.log('[qstash:mock] publishJSON', JSON.stringify(opts))
        if (opts.url) {
          // Trigger the job asynchronously (honoring the delay if any)
          setTimeout(async () => {
            try {
              console.log(`[qstash:mock] Triggering local job: ${opts.url}`)
              const res = await fetch(opts.url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(opts.headers || {}),
                },
                body: JSON.stringify(opts.body),
              })
              if (!res.ok) {
                console.error(`[qstash:mock] Job execution failed for ${opts.url}:`, await res.text())
              } else {
                console.log(`[qstash:mock] Job execution succeeded for ${opts.url}`)
              }
            } catch (e) {
              console.error(`[qstash:mock] Failed to trigger job ${opts.url}:`, e)
            }
          }, (opts.delay ?? 0) * 1000)
        }
        return { messageId: 'mock-' + Date.now() }
      },
    } as unknown as Client
  }
  _client = new Client({ token })
  return _client
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export interface EnqueueOptions {
  /** Delay in seconds before the job fires */
  delay?: number
  /** ISO timestamp for scheduled execution */
  notBefore?: string
  /** Unique deduplication key */
  deduplicationId?: string
  /** Number of retries on failure */
  retries?: number
}

/**
 * Enqueue a job to an internal Next.js API route.
 */
export async function enqueue<T = unknown>(
  path: string,
  payload: T,
  opts: EnqueueOptions = {}
): Promise<{ messageId: string }> {
  const client = getClient()
  return client.publishJSON({
    url: `${APP_URL}${path}`,
    body: payload,
    delay: opts.delay,
    notBefore: opts.notBefore ? new Date(opts.notBefore).getTime() / 1000 : undefined,
    deduplicationId: opts.deduplicationId,
    retries: opts.retries ?? 3,
  })
}

// -------------------------------------------------------------------------
// Receiver (verify inbound QStash requests)
// -------------------------------------------------------------------------

let _receiver: Receiver | null = null

export function getReceiver(): Receiver {
  if (_receiver) return _receiver
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY
  const next = process.env.QSTASH_NEXT_SIGNING_KEY
  if (!current) {
    console.warn('[qstash] signing keys not set — skipping verification (dev mode)')
    return { verify: async () => true } as unknown as Receiver
  }
  _receiver = new Receiver({ currentSigningKey: current, nextSigningKey: next || current })
  return _receiver
}

/**
 * Verify a QStash webhook request. Call at the top of each /api/jobs/* handler.
 * Returns false if invalid (route should return 401).
 */
export async function verifyQStash(req: NextRequest): Promise<boolean> {
  try {
    const signature = req.headers.get('upstash-signature') ?? ''
    const body = await req.text()
    return getReceiver().verify({ signature, body })
  } catch {
    return false
  }
}

// -------------------------------------------------------------------------
// Predefined job enqueue helpers
// -------------------------------------------------------------------------

export const Jobs = {
  /** Fan out one campaign batch */
  campaignBatch: (payload: { campaignId: string; workspaceId: string; batchOffset: number }) =>
    enqueue('/api/jobs/campaign-batch', payload, { retries: 2 }),

  /** Execute one step of a workflow run */
  workflowStep: (payload: { runId: string; nodeId: string; workspaceId: string }, delaySeconds?: number) =>
    enqueue('/api/jobs/workflow-step', payload, { delay: delaySeconds, retries: 3 }),

  /** Sync leads from a Google Sheet */
  leadSync: (payload: { settingsId: string; workspaceId: string }) =>
    enqueue('/api/jobs/lead-sync', payload, { deduplicationId: `lead-sync-${payload.settingsId}` }),

  /** Embed a knowledge document */
  embedDocument: (payload: { documentId: string; workspaceId: string }) =>
    enqueue('/api/jobs/embed', payload, { retries: 2 }),
}
