// Server-side Supabase client for the Supabase Auth flow.
//
// Reads/writes the session cookies set by the auth handshake. Use inside Next.js Route
// Handlers, Server Components, or Server Actions when you need to know who the user is.
//
// For privileged operations that should bypass RLS (Xero token storage, etc), use
// `lib/supabaseAdmin.ts` which uses the SUPABASE_SERVICE_ROLE_KEY.

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/** Create a server-side Supabase client bound to the current request's cookies. */
export function getSupabaseServer(): SupabaseClient | null {
  if (!url || !anonKey) return null
  const cookieStore = cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        // In Route Handlers cookies().set is available. In Server Components it throws,
        // which is fine — set() will only be called during auth-handshake routes.
        try {
          cookieStore.set({ name, value, ...options })
        } catch {
          // Server Component context — read-only cookies. Auth refresh happens elsewhere.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options })
        } catch {
          // see above
        }
      },
    },
  })
}

/** Resolve the current user from the session cookie. Null if no session or no Supabase. */
export async function getServerUser() {
  const supabase = getSupabaseServer()
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user
}
