// Server-only Supabase client using the service role key.
//
// This client bypasses RLS — never import it from a client component, and never expose any
// data it returns to unauthenticated requests. Used today only for Xero token storage in the
// `fg_xero_tokens` singleton row, which RLS denies to the anon role.
//
// Requires SUPABASE_SERVICE_ROLE_KEY env var (NOT NEXT_PUBLIC_*; must stay server-only).
// If unset, `supabaseAdmin` is null and callers should treat the integration as not configured
// rather than silently falling back to a less-secure path.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// .trim() defends against a trailing newline/space pasted into the Vercel env UI — an untrimmed
// service key fails auth, so every server-side admin read (e.g. Xero token storage) silently breaks.
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export const supabaseAdmin: SupabaseClient | null = (url && serviceKey)
  ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      // CRITICAL: opt every PostgREST call out of Next's Data Cache. supabase-js rides on global
      // fetch, and Next 14 route handlers cache fetch GETs - so WITHOUT no-store, different routes
      // serve different stale snapshots of the DB. Proven live on fg_xero_tokens: /api/xero/status
      // kept returning a Formation row 35+ minutes after disconnect deleted it (stale "Connected"
      // hid the Connect button, so reconnect was impossible), and a refresh reading a cached,
      // already-rotated refresh token gets invalid_grant - the "tokens randomly die" failure.
      global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    })
  : null

export const isSupabaseAdminConfigured = (): boolean => !!supabaseAdmin
