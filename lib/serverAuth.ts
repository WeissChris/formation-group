// Server-only auth helpers. Do NOT import from a client component — the runtime checks below
// will throw at import time on the edge runtime if `crypto` is unavailable.

import { createHmac, scryptSync, timingSafeEqual } from 'crypto'

export const SESSION_COOKIE = 'fg_session'
export const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

/**
 * Resolve the HMAC secret used to sign session cookies.
 *
 * Precedence (most-secure first):
 *   1. SESSION_SECRET           — explicit, ≥32-byte random hex (recommended in prod)
 *   2. APP_PASSWORD_HASH        — deterministic fallback so flipping a forgotten SESSION_SECRET
 *                                 doesn't lock you out (changing password rotates sessions anyway)
 *   3. NEXT_PUBLIC_APP_PASSWORD — dev-only fallback so the legacy flow keeps working
 *   4. constant string          — last-ditch dev fallback
 */
function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  if (process.env.APP_PASSWORD_HASH) return process.env.APP_PASSWORD_HASH
  if (process.env.NEXT_PUBLIC_APP_PASSWORD) return `dev:${process.env.NEXT_PUBLIC_APP_PASSWORD}`
  return 'dev-fallback-do-not-use-in-prod'
}

/**
 * Verify a candidate password against the configured hash.
 *
 * Preferred storage: APP_PASSWORD_HASH = `scrypt$<hex-salt>$<hex-hash>` (see scripts/hash-password).
 * Fallback for now: plain APP_PASSWORD or NEXT_PUBLIC_APP_PASSWORD (timing-safe compared).
 * The NEXT_PUBLIC_ fallback still leaks the password in the JS bundle — flip APP_PASSWORD_HASH
 * to retire it.
 */
export function verifyPassword(input: string): boolean {
  if (typeof input !== 'string') return false

  const hashSpec = process.env.APP_PASSWORD_HASH
  if (hashSpec) {
    const parts = hashSpec.split('$')
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false
    try {
      const salt = Buffer.from(parts[1], 'hex')
      const expected = Buffer.from(parts[2], 'hex')
      const actual = scryptSync(input, salt, expected.length)
      return actual.length === expected.length && timingSafeEqual(actual, expected)
    } catch {
      return false
    }
  }

  // Legacy plaintext fallback — kept temporarily so an unconfigured deploy still works
  const plain = process.env.APP_PASSWORD || process.env.NEXT_PUBLIC_APP_PASSWORD
  if (!plain) return false
  if (input.length !== plain.length) return false
  try {
    return timingSafeEqual(Buffer.from(input), Buffer.from(plain))
  } catch {
    return false
  }
}

interface SessionPayload {
  v: number    // schema version, lets us evolve the payload
  sub: string  // subject — single-user app, always "chris"
  exp: number  // expiry, unix seconds
}

/**
 * Sign a session payload into a compact cookie value: `<base64url-payload>.<base64url-sig>`.
 * Forgery requires the SESSION_SECRET.
 */
function signSession(payload: SessionPayload): string {
  const json = JSON.stringify(payload)
  const data = Buffer.from(json).toString('base64url')
  const sig = createHmac('sha256', getSessionSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

/**
 * Verify a session cookie value. Returns the payload if valid and unexpired, null otherwise.
 * Constant-time signature comparison.
 */
export function verifySession(value: string | undefined | null): SessionPayload | null {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [data, sig] = parts
  const expectedSig = createHmac('sha256', getSessionSecret()).update(data).digest('base64url')
  if (sig.length !== expectedSig.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null
  } catch {
    return null
  }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.exp !== 'number') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

/** Build a freshly-signed session cookie value with the configured TTL. */
export function createSessionCookieValue(): string {
  const payload: SessionPayload = {
    v: 1,
    sub: 'chris',
    exp: Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS,
  }
  return signSession(payload)
}
