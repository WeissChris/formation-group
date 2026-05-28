// Browser-side Supabase client for the Supabase Auth flow.
//
// Uses @supabase/ssr's createBrowserClient which handles cookie storage automatically —
// the session is held in httpOnly cookies set by the server callback, NOT in localStorage.
// Auth state is shared across tabs and survives reload.
//
// Use this client for:
//   - supabase.auth.signInWithPassword({ email, password })
//   - supabase.auth.signOut()
//   - any client-side read of auth-scoped tables (RLS will use the session automatically)
//
// For server-side reads/writes that depend on the user, use `lib/supabaseServer.ts` instead.

import { createBrowserClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Singleton — multiple createBrowserClient() calls work but waste resources.
let _client: SupabaseClient | null = null

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!url || !anonKey) return null
  if (_client) return _client
  _client = createBrowserClient(url, anonKey, {
    cookies: {
      get(name: string) {
        if (typeof document === 'undefined') return undefined
        const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
        return match ? decodeURIComponent(match[1]) : undefined
      },
      set(name: string, value: string, options: CookieOptions) {
        if (typeof document === 'undefined') return
        let cookie = `${name}=${encodeURIComponent(value)}`
        if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`
        if (options.path) cookie += `; Path=${options.path}`
        if (options.sameSite) cookie += `; SameSite=${options.sameSite}`
        if (options.secure) cookie += `; Secure`
        document.cookie = cookie
      },
      remove(name: string, options: CookieOptions) {
        if (typeof document === 'undefined') return
        document.cookie = `${name}=; Max-Age=0; Path=${options.path || '/'}`
      },
    },
  })
  return _client
}

/** True when the Supabase Auth flow should be used instead of the legacy custom auth. */
export function isSupabaseAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'supabase'
}
