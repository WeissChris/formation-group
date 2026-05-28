// Auth helpers.
//
// Two backends, selected by NEXT_PUBLIC_AUTH_PROVIDER:
//
//   - "supabase" → uses Supabase Auth (signInWithPassword + httpOnly session cookies via
//                  @supabase/ssr). Recommended long-term. Requires a user created in your
//                  Supabase dashboard (Auth → Users → Add user) and email confirmation
//                  either disabled or completed.
//
//   - anything else → uses the custom scrypt+HMAC-cookie backend at /api/auth/*. This was
//                     the intermediate step that moved the password off the client bundle.
//                     Kept as fallback so flipping the flag back is a one-env-var change.
//
// Set NEXT_PUBLIC_AUTH_PROVIDER=supabase on Vercel once your Supabase user is created and
// you've confirmed sign-in works in dev.

import { getSupabaseBrowser, isSupabaseAuthEnabled } from './supabaseBrowser'

const LEGACY_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || 'formation2026'

// ── Legacy sync helpers (still here for compat; the new flow doesn't use them) ───

/** @deprecated Use loginRemote — this still ships the password in the JS bundle. */
export function checkPassword(input: string): boolean {
  return input === LEGACY_PASSWORD
}

/** @deprecated Cookie is set server-side. */
export function setAuth(): void {
  if (typeof window !== 'undefined') localStorage.setItem('formation_auth', btoa(LEGACY_PASSWORD))
}

/** @deprecated Use isAuthenticatedRemote. */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('formation_auth') === btoa(LEGACY_PASSWORD)
}

/** @deprecated Use signOutRemote. */
export function signOut(): void {
  if (typeof window !== 'undefined') localStorage.removeItem('formation_auth')
}

// ── New flow ─────────────────────────────────────────────────────────────────

/**
 * Sign in.
 *
 * In Supabase mode `input` is treated as `email:password` (split on first colon) or, if no
 * colon present, as just the password with `process.env.NEXT_PUBLIC_DEFAULT_EMAIL` as the
 * email (handy for single-user setups). In custom mode `input` is just the password.
 *
 * Returns true on success. Use `getLastAuthError()` to read the last failure reason for UX.
 */
let _lastAuthError: string | null = null

export function getLastAuthError(): string | null {
  return _lastAuthError
}

export async function loginRemote(input: string): Promise<boolean> {
  _lastAuthError = null
  if (isSupabaseAuthEnabled()) {
    const supabase = getSupabaseBrowser()
    if (!supabase) {
      _lastAuthError = 'Supabase is not configured.'
      return false
    }
    const { email, password } = splitEmailPassword(input)
    if (!email) {
      _lastAuthError = 'Enter email and password (use "email@example.com:yourpassword" or set NEXT_PUBLIC_DEFAULT_EMAIL).'
      return false
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      _lastAuthError = error.message
      return false
    }
    return true
  }

  // Legacy custom flow — POST to our scrypt+HMAC endpoint
  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input }),
    })
    if (!resp.ok) _lastAuthError = resp.status === 401 ? 'Incorrect password' : `Login failed (${resp.status})`
    return resp.ok
  } catch (e) {
    _lastAuthError = e instanceof Error ? e.message : 'Network error'
    return false
  }
}

/** Check current sign-in status. */
export async function isAuthenticatedRemote(): Promise<boolean> {
  if (isSupabaseAuthEnabled()) {
    const supabase = getSupabaseBrowser()
    if (!supabase) return false
    const { data } = await supabase.auth.getUser()
    return !!data.user
  }
  try {
    const resp = await fetch('/api/auth/me', { cache: 'no-store' })
    if (!resp.ok) return false
    const data = await resp.json()
    return !!data.authenticated
  } catch {
    return false
  }
}

/** Sign out — clears the session cookie. */
export async function signOutRemote(): Promise<void> {
  if (isSupabaseAuthEnabled()) {
    const supabase = getSupabaseBrowser()
    if (supabase) await supabase.auth.signOut()
  } else {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // best-effort
    }
  }
  if (typeof window !== 'undefined') localStorage.removeItem('formation_auth')
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function splitEmailPassword(input: string): { email: string; password: string } {
  const colonIdx = input.indexOf(':')
  if (colonIdx > 0) {
    return { email: input.slice(0, colonIdx).trim(), password: input.slice(colonIdx + 1) }
  }
  // No colon → treat the whole input as password, pull email from env (single-user setup)
  const defaultEmail = process.env.NEXT_PUBLIC_DEFAULT_EMAIL || ''
  return { email: defaultEmail.trim(), password: input }
}
