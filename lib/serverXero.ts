// Server-only Xero token lifecycle.
//
// All Xero token storage lives here. The client never sees access/refresh tokens — only
// connection status via /api/xero/status. This closes three audit findings at once:
//   - Tokens no longer pass through URL query params (history/referrer/log leak)
//   - Tokens no longer sit in localStorage (XSS-readable)
//   - Refresh route no longer accepts arbitrary refresh tokens from the body
//
// Storage: singleton row in `fg_xero_tokens` accessed via supabaseAdmin (service role bypasses RLS).
// Without SUPABASE_SERVICE_ROLE_KEY configured, every call returns null/false; the UI surfaces
// "not configured" rather than silently falling back to insecure storage.

import { supabaseAdmin } from './supabaseAdmin'

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const SINGLETON_ID = 'singleton'

export interface XeroTokenRow {
  accessToken: string
  refreshToken: string
  expiresAt: number  // unix ms
  tenantId: string
  tenantName: string
}

interface DbRow {
  id: string
  access_token: string
  refresh_token: string
  expires_at: number
  tenant_id: string
  tenant_name: string
  updated_at: string
}

function rowToTokens(row: DbRow): XeroTokenRow {
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: Number(row.expires_at),
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
  }
}

/** Read the current Xero tokens (or null if none stored / admin not configured). */
export async function getTokens(): Promise<XeroTokenRow | null> {
  if (!supabaseAdmin) return null
  const { data, error } = await supabaseAdmin
    .from('fg_xero_tokens')
    .select('*')
    .eq('id', SINGLETON_ID)
    .maybeSingle()
  if (error || !data) return null
  return rowToTokens(data as DbRow)
}

/** Upsert the singleton Xero tokens row. */
export async function saveTokens(tokens: XeroTokenRow): Promise<boolean> {
  if (!supabaseAdmin) return false
  const { error } = await supabaseAdmin
    .from('fg_xero_tokens')
    .upsert({
      id: SINGLETON_ID,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      tenant_id: tokens.tenantId,
      tenant_name: tokens.tenantName,
      updated_at: new Date().toISOString(),
    })
  return !error
}

/** Delete the stored Xero tokens (disconnect flow). */
export async function clearTokens(): Promise<boolean> {
  if (!supabaseAdmin) return false
  const { error } = await supabaseAdmin
    .from('fg_xero_tokens')
    .delete()
    .eq('id', SINGLETON_ID)
  return !error
}

/**
 * Refresh the access token using Xero's token endpoint.
 * Preserves tenantId / tenantName from the existing row (Xero's refresh response doesn't include them).
 * On failure, returns null without modifying stored tokens.
 */
async function refreshTokens(): Promise<XeroTokenRow | null> {
  const prior = await getTokens()
  if (!prior) return null
  // `.trim()` defends against trailing whitespace in env values — see init/callback for why.
  const clientId = (process.env.NEXT_PUBLIC_XERO_CLIENT_ID || '').trim()
  const clientSecret = (process.env.XERO_CLIENT_SECRET || '').trim()
  if (!clientId || !clientSecret) return null

  const response = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: prior.refreshToken,
    }),
  })
  if (!response.ok) return null
  const data = await response.json()

  const next: XeroTokenRow = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (Number(data.expires_in) * 1000),
    tenantId: prior.tenantId,    // refresh response does NOT include tenant info — carry forward
    tenantName: prior.tenantName,
  }
  const saved = await saveTokens(next)
  return saved ? next : null
}

/**
 * Get tokens valid right now — refreshes if they expire within 5 minutes.
 * Returns null if no tokens are stored or refresh fails (e.g. expired refresh token).
 */
export async function getValidTokens(): Promise<XeroTokenRow | null> {
  const tokens = await getTokens()
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt - 5 * 60 * 1000) return tokens
  return refreshTokens()
}

/** Public-facing connection status — what /api/xero/status returns to the client. */
export async function getStatus(): Promise<{
  connected: boolean
  tenantName?: string
  expiresAt?: number
  configured: boolean
}> {
  if (!supabaseAdmin) {
    return { connected: false, configured: false }
  }
  const tokens = await getTokens()
  if (!tokens) return { connected: false, configured: true }
  return {
    connected: Date.now() < tokens.expiresAt,
    tenantName: tokens.tenantName,
    expiresAt: tokens.expiresAt,
    configured: true,
  }
}
