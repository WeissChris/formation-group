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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const supabaseAdmin: SupabaseClient | null = (url && serviceKey)
  ? createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

export const isSupabaseAdminConfigured = (): boolean => !!supabaseAdmin
