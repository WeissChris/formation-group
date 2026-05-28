import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { scryptSync, randomBytes } from 'node:crypto'

// IMPORTANT: import dynamically inside tests after env mutation so the env-derived
// helpers (getSessionSecret) pick up the test values. vi.resetModules() clears Vitest's
// ESM module cache between calls so each freshAuth() returns a freshly-evaluated module.
async function freshAuth() {
  vi.resetModules()
  return await import('./serverAuth')
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  // Clean slate per test — these env vars drive everything we're checking.
  delete process.env.APP_PASSWORD_HASH
  delete process.env.APP_PASSWORD
  delete process.env.NEXT_PUBLIC_APP_PASSWORD
  delete process.env.SESSION_SECRET
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('verifyPassword — scrypt hash path', () => {
  it('accepts the correct password', async () => {
    const password = 'correct-horse-battery-staple'
    const salt = randomBytes(16)
    const hash = scryptSync(password, salt, 64)
    process.env.APP_PASSWORD_HASH = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
    const { verifyPassword } = await freshAuth()
    expect(verifyPassword(password)).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const salt = randomBytes(16)
    const hash = scryptSync('right', salt, 64)
    process.env.APP_PASSWORD_HASH = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
    const { verifyPassword } = await freshAuth()
    expect(verifyPassword('wrong')).toBe(false)
  })

  it('rejects a malformed hash spec (wrong scheme)', async () => {
    process.env.APP_PASSWORD_HASH = 'argon2$abc$def'
    const { verifyPassword } = await freshAuth()
    expect(verifyPassword('anything')).toBe(false)
  })

  it('rejects a malformed hash spec (wrong segment count)', async () => {
    process.env.APP_PASSWORD_HASH = 'scrypt$abcdef'
    const { verifyPassword } = await freshAuth()
    expect(verifyPassword('anything')).toBe(false)
  })
})

describe('verifyPassword — plaintext fallback', () => {
  it('accepts when APP_PASSWORD matches and no hash is configured', async () => {
    process.env.APP_PASSWORD = 'plain-secret'
    const { verifyPassword } = await freshAuth()
    expect(verifyPassword('plain-secret')).toBe(true)
    expect(verifyPassword('wrong')).toBe(false)
  })

  it('falls through to NEXT_PUBLIC_APP_PASSWORD as last resort', async () => {
    process.env.NEXT_PUBLIC_APP_PASSWORD = 'public-default'
    const { verifyPassword } = await freshAuth()
    expect(verifyPassword('public-default')).toBe(true)
  })

  it('rejects when no password is configured at all', async () => {
    const { verifyPassword } = await freshAuth()
    expect(verifyPassword('anything')).toBe(false)
  })

  it('rejects non-string inputs without crashing', async () => {
    process.env.APP_PASSWORD = 'x'
    const { verifyPassword } = await freshAuth()
    // @ts-expect-error - testing runtime robustness against non-string
    expect(verifyPassword(null)).toBe(false)
    // @ts-expect-error
    expect(verifyPassword(undefined)).toBe(false)
    // @ts-expect-error
    expect(verifyPassword(42)).toBe(false)
  })

  it('hash path takes precedence over plaintext', async () => {
    // If both are set, the hash is authoritative — verifies plaintext is NOT consulted.
    const salt = randomBytes(16)
    const hash = scryptSync('hash-only', salt, 64)
    process.env.APP_PASSWORD_HASH = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
    process.env.APP_PASSWORD = 'plain-only'

    const { verifyPassword } = await freshAuth()
    expect(verifyPassword('hash-only')).toBe(true)
    expect(verifyPassword('plain-only')).toBe(false)
  })
})

describe('session cookie sign + verify round-trip', () => {
  it('a freshly-signed session verifies and returns the payload', async () => {
    process.env.SESSION_SECRET = 'test-secret-32-bytes-long-xxxxxxxxxxx'
    const { createSessionCookieValue, verifySession } = await freshAuth()
    const cookie = createSessionCookieValue()
    const payload = verifySession(cookie)
    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe('chris')
    expect(payload!.v).toBe(1)
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('returns null for undefined / empty / malformed cookie', async () => {
    process.env.SESSION_SECRET = 'whatever'
    const { verifySession } = await freshAuth()
    expect(verifySession(undefined)).toBeNull()
    expect(verifySession(null)).toBeNull()
    expect(verifySession('')).toBeNull()
    expect(verifySession('no-dot')).toBeNull()
    expect(verifySession('a.b.c')).toBeNull() // too many parts
  })

  it('rejects a cookie signed with a different secret', async () => {
    process.env.SESSION_SECRET = 'secret-a'
    const { createSessionCookieValue } = await freshAuth()
    const cookie = createSessionCookieValue()

    process.env.SESSION_SECRET = 'secret-b'
    const { verifySession: verifyB } = await freshAuth()
    expect(verifyB(cookie)).toBeNull()
  })

  it('rejects a tampered payload (signature mismatch)', async () => {
    process.env.SESSION_SECRET = 'secret'
    const { createSessionCookieValue, verifySession } = await freshAuth()
    const cookie = createSessionCookieValue()
    const [data, sig] = cookie.split('.')
    // Flip a payload byte → signature will no longer match
    const tampered = data.slice(0, -1) + (data.slice(-1) === 'A' ? 'B' : 'A') + '.' + sig
    expect(verifySession(tampered)).toBeNull()
  })

  it('rejects an expired session', async () => {
    process.env.SESSION_SECRET = 'secret'
    // Build a payload with exp in the past, sign with the same secret.
    // We can do this by re-implementing signSession's wire format here.
    const { createHmac } = await import('node:crypto')
    const payload = { v: 1, sub: 'chris', exp: Math.floor(Date.now() / 1000) - 60 }
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = createHmac('sha256', 'secret').update(data).digest('base64url')
    const cookie = `${data}.${sig}`

    const { verifySession } = await freshAuth()
    expect(verifySession(cookie)).toBeNull()
  })
})
