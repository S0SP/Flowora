/**
 * Flowora — Upstash Redis client (singleton).
 * Used for: hot settings cache, credit balance cache, rate limiting, presence.
 *
 * Install: npm install @upstash/redis
 * Env: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 */

import { Redis } from '@upstash/redis'

let _redis: Redis | null = null

export function redis(): Redis {
  if (_redis) return _redis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    // In dev without Redis, return a no-op compatible mock so the app boots
    console.warn('[redis] UPSTASH_REDIS env vars not set — using in-memory mock (dev only)')
    const store = new Map<string, unknown>()
    _redis = {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: unknown, opts?: unknown) => { store.set(key, value); return 'OK' },
      del: async (...keys: string[]) => { keys.forEach(k => store.delete(k)); return keys.length },
      expire: async () => 1,
      incr: async (key: string) => { const v = ((store.get(key) as number) ?? 0) + 1; store.set(key, v); return v },
      pipeline: () => ({ exec: async () => [] }),
    } as unknown as Redis
    return _redis
  }

  _redis = new Redis({ url, token })
  return _redis
}

// Cache helpers -----------------------------------------------------------

const DEFAULT_TTL = 300 // 5 minutes

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await redis().get<T>(key)
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
  try {
    await redis().set(key, value, { ex: ttlSeconds })
  } catch {}
}

export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    await redis().del(...keys)
  } catch {}
}

// Key namespaces ----------------------------------------------------------

export const CacheKey = {
  workspaceSettings: (wsId: string) => `ws:${wsId}:settings`,
  creditBalance: (wsId: string) => `ws:${wsId}:credits`,
  channelConfig: (wsId: string, type: string) => `ws:${wsId}:channel:${type}`,
  chatbotConfig: (wsId: string) => `ws:${wsId}:chatbot`,
  voiceAgentConfig: (wsId: string) => `ws:${wsId}:voice`,
  rateLimit: (key: string) => `rl:${key}`,
}

// Rate limiter (sliding window) -------------------------------------------

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const now = Date.now()
    const windowKey = `${CacheKey.rateLimit(key)}:${Math.floor(now / (windowSeconds * 1000))}`
    const count = await redis().incr(windowKey)
    if (count === 1) await redis().expire(windowKey, windowSeconds)
    return { allowed: count <= maxRequests, remaining: Math.max(0, maxRequests - count) }
  } catch {
    return { allowed: true, remaining: maxRequests }
  }
}
