// Lightweight in-memory rate limiter for the public-reachable API routes (login, email sends).
//
// Per-IP sliding window. State lives in the module (per serverless instance) and resets on cold
// start, so this is a BEST-EFFORT slowdown, not a distributed guarantee: it blunts password
// brute-force (stacked on scrypt) and email-send spam without standing up Redis. For hard,
// cross-instance limits, front it with Upstash/`@vercel/kv` and keep this as the local fallback.

type Hits = number[]
const buckets = new Map<string, Hits>()
let lastGc = 0
const GC_INTERVAL_MS = 5 * 60_000
const STALE_MS = 60 * 60_000

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

/**
 * Record a hit for `key` and report whether it's within `limit` over the trailing `windowMs`.
 * `now` is injectable for tests. A blocked call does NOT consume budget (so the window can drain).
 */
export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  // Occasionally drop buckets that have gone quiet so the Map can't grow unbounded.
  if (now - lastGc > GC_INTERVAL_MS) {
    buckets.forEach((hits, k) => {
      if (hits.length === 0 || hits[hits.length - 1] < now - STALE_MS) buckets.delete(k)
    })
    lastGc = now
  }

  const cutoff = now - windowMs
  const hits = (buckets.get(key) ?? []).filter(t => t > cutoff)

  if (hits.length >= limit) {
    buckets.set(key, hits)
    const retryAfterMs = hits[0] + windowMs - now
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)), remaining: 0 }
  }

  hits.push(now)
  buckets.set(key, hits)
  return { allowed: true, retryAfterSeconds: 0, remaining: limit - hits.length }
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim() || 'unknown'
  return request.headers.get('x-real-ip') || 'unknown'
}

/** Test-only: clear all buckets. */
export function __resetRateLimit(): void {
  buckets.clear()
  lastGc = 0
}
