// Server-only auth for the /site supervisor cockpit. Mirrors lib/serverAuth.ts (the admin gate) but
// authorises a SUPERVISOR (per-person passcode) rather than the single admin password, and carries the
// supervisor identity in its own cookie so the two sessions never collide.
//
// Do NOT import from a client component — uses node `crypto`.

import { createHmac, scryptSync, randomBytes, timingSafeEqual } from 'crypto'

export const SITE_SESSION_COOKIE = 'fg_site_session'
export const SITE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days

/**
 * HMAC secret for signing supervisor session cookies. Same precedence + resolution as the admin
 * session (lib/serverAuth.ts) so prod only configures one SESSION_SECRET. A supervisor cookie and an
 * admin cookie are distinguished by their cookie NAME and payload shape, not by the secret.
 */
function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  if (process.env.APP_PASSWORD_HASH) return process.env.APP_PASSWORD_HASH
  if (process.env.NEXT_PUBLIC_APP_PASSWORD) return `dev:${process.env.NEXT_PUBLIC_APP_PASSWORD}`
  return 'dev-fallback-do-not-use-in-prod'
}

const SCRYPT_KEYLEN = 64

/** Hash a plaintext passcode for storage: `scrypt$<hex-salt>$<hex-hash>`. Same format as APP_PASSWORD_HASH. */
export function hashPasscode(plain: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

/** Verify a candidate passcode against a stored `scrypt$salt$hash`. Constant-time. */
export function verifySupervisorPasscode(input: string, passcodeHash: string | null | undefined): boolean {
  if (typeof input !== 'string' || !input || !passcodeHash) return false
  const parts = passcodeHash.split('$')
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

export interface SiteSessionPayload {
  v: number       // schema version
  sub: string     // supervisor id
  name: string    // supervisor name (used for project ownership matching: project.foreman === name)
  exp: number     // expiry, unix seconds
  office?: boolean // true = this is an office/admin user (not a supervisor); may open ANY project
}

/** Sign a payload into `<base64url-payload>.<base64url-sig>`. Forgery needs SESSION_SECRET. */
function signSite(payload: SiteSessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', getSessionSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

/** Verify a supervisor session cookie value. Returns the payload if valid + unexpired, else null. */
export function verifySiteSession(value: string | undefined | null): SiteSessionPayload | null {
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
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SiteSessionPayload
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
    if (typeof payload.sub !== 'string' || typeof payload.name !== 'string') return null
    return payload
  } catch {
    return null
  }
}

/** Build a freshly-signed supervisor session cookie value for the given supervisor. */
export function createSiteSessionCookieValue(supervisorId: string, name: string): string {
  return signSite({
    v: 1,
    sub: supervisorId,
    name,
    exp: Math.floor(Date.now() / 1000) + SITE_COOKIE_MAX_AGE_SECONDS,
  })
}
