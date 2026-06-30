// Server-only Xero token lifecycle.
//
// All Xero token storage lives here. The client never sees access/refresh tokens — only
// connection status via /api/xero/status. This closes three audit findings at once:
//   - Tokens no longer pass through URL query params (history/referrer/log leak)
//   - Tokens no longer sit in localStorage (XSS-readable)
//   - Refresh route no longer accepts arbitrary refresh tokens from the body
//
// Storage: one row per entity in `fg_xero_tokens` (id = 'formation' | 'lume'), accessed via
// supabaseAdmin (service role bypasses RLS). Formation and Lume are separate Xero organisations, so
// each holds its own connection; reads/writes are routed by the project's entity. Without
// SUPABASE_SERVICE_ROLE_KEY configured, every call returns null/false and the UI surfaces
// "not configured" rather than silently falling back to insecure storage.

import { supabaseAdmin } from './supabaseAdmin'

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'

/** Xero-connectable entities. 'design' has no Xero organisation. */
export type XeroEntity = 'formation' | 'lume'
export function isXeroEntity(v: unknown): v is XeroEntity {
  return v === 'formation' || v === 'lume'
}

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

/**
 * Read an entity's Xero tokens (or null if none stored / admin not configured).
 *
 * Migration fallback: the original single connection lived under id='singleton' (it was the Formation
 * org). Read it for 'formation' until a Formation reconnect writes the 'formation' row, so the cost
 * feed keeps working without an immediate reconnect.
 */
export async function getTokens(entity: XeroEntity = 'formation'): Promise<XeroTokenRow | null> {
  if (!supabaseAdmin) return null
  const { data, error } = await supabaseAdmin
    .from('fg_xero_tokens')
    .select('*')
    .eq('id', entity)
    .maybeSingle()
  if (!error && data) return rowToTokens(data as DbRow)
  if (entity === 'formation') {
    const { data: legacy } = await supabaseAdmin
      .from('fg_xero_tokens')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle()
    if (legacy) return rowToTokens(legacy as DbRow)
  }
  return null
}

/** Upsert an entity's Xero tokens row. */
export async function saveTokens(entity: XeroEntity, tokens: XeroTokenRow): Promise<boolean> {
  if (!supabaseAdmin) return false
  const { error } = await supabaseAdmin
    .from('fg_xero_tokens')
    .upsert({
      id: entity,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
      tenant_id: tokens.tenantId,
      tenant_name: tokens.tenantName,
      updated_at: new Date().toISOString(),
    })
  return !error
}

/** Delete an entity's stored Xero tokens (disconnect flow). */
export async function clearTokens(entity: XeroEntity = 'formation'): Promise<boolean> {
  if (!supabaseAdmin) return false
  const { error } = await supabaseAdmin.from('fg_xero_tokens').delete().eq('id', entity)
  // Also drop the legacy singleton row when disconnecting Formation, so it can't shadow a reconnect.
  if (entity === 'formation') {
    await supabaseAdmin.from('fg_xero_tokens').delete().eq('id', 'singleton')
  }
  return !error
}

// In-flight refresh per entity. Xero ROTATES the refresh token on every refresh (the old one is
// invalidated immediately), so two parallel refreshes race and the loser gets invalid_grant. Sharing
// one promise coalesces a burst of calls (status poll + cost feed + accounts + probe) into a single
// refresh within a warm instance; the re-read recovery below handles the cross-instance case.
const refreshInFlight: Partial<Record<XeroEntity, Promise<XeroTokenRow | null>>> = {}

/**
 * Refresh an entity's access token. Coalesces concurrent calls; on the rotation race re-reads the
 * stored token and uses whatever another request already refreshed. NEVER deletes the row on failure —
 * a racing/transient invalid_grant must not kill a good connection (that forced repeated reconnects).
 */
async function refreshTokens(entity: XeroEntity): Promise<XeroTokenRow | null> {
  const existing = refreshInFlight[entity]
  if (existing) return existing
  const p = doRefresh(entity).finally(() => { delete refreshInFlight[entity] })
  refreshInFlight[entity] = p
  return p
}

async function doRefresh(entity: XeroEntity): Promise<XeroTokenRow | null> {
  const prior = await getTokens(entity)
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
  if (!response.ok) {
    // invalid_grant usually means another request/instance already refreshed and rotated the token, so
    // OUR refresh token is now stale. Re-read: if a newer, still-valid token is stored, that refresh
    // succeeded elsewhere — use it. Otherwise just return null (the row is preserved; the user can
    // reconnect if it's genuinely dead). We deliberately do NOT clear here.
    if (response.status === 400) {
      const latest = await getTokens(entity)
      if (latest && latest.refreshToken !== prior.refreshToken && Date.now() < latest.expiresAt - 60_000) {
        return latest
      }
    }
    return null
  }
  const data = await response.json()

  const next: XeroTokenRow = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (Number(data.expires_in) * 1000),
    tenantId: prior.tenantId,    // refresh response does NOT include tenant info — carry forward
    tenantName: prior.tenantName,
  }
  const saved = await saveTokens(entity, next)
  return saved ? next : null
}

/**
 * Get an entity's tokens valid right now — refreshes if they expire within 5 minutes.
 * Defaults to 'formation' so existing single-org callers (cost feed, read proxies) are unaffected.
 * Returns null if no tokens are stored or refresh fails (e.g. expired refresh token).
 */
export async function getValidTokens(entity: XeroEntity = 'formation'): Promise<XeroTokenRow | null> {
  const tokens = await getTokens(entity)
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt - 5 * 60 * 1000) return tokens
  return refreshTokens(entity)
}

/** Public-facing connection status — what /api/xero/status returns to the client, per entity. */
export async function getStatus(entity: XeroEntity = 'formation'): Promise<{
  connected: boolean
  tenantName?: string
  expiresAt?: number
  configured: boolean
}> {
  if (!supabaseAdmin) {
    return { connected: false, configured: false }
  }
  const tokens = await getTokens(entity)
  if (!tokens) return { connected: false, configured: true }
  // Connection is live whenever a token row exists with a refresh token: Xero access tokens
  // expire every 30 min, but getValidTokens() refreshes them on demand, so an expired access
  // token does NOT mean disconnected. (Disconnect deletes the row — presence is the signal.)
  return {
    connected: !!tokens.refreshToken,
    tenantName: tokens.tenantName,
    expiresAt: tokens.expiresAt,
    configured: true,
  }
}
