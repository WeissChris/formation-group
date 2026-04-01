const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize'
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

const CLIENT_ID = process.env.NEXT_PUBLIC_XERO_CLIENT_ID || ''
const REDIRECT_URI = process.env.NEXT_PUBLIC_XERO_REDIRECT_URI || 'https://formation-group.vercel.app/settings/xero/callback'

export interface XeroTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix timestamp
  tenantId: string
  tenantName: string
}

export function getXeroTokens(): XeroTokens | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem('fg_xero_tokens')
    return stored ? JSON.parse(stored) : null
  } catch { return null }
}

export function saveXeroTokens(tokens: XeroTokens): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('fg_xero_tokens', JSON.stringify(tokens))
}

export function clearXeroTokens(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('fg_xero_tokens')
}

export function isXeroConnected(): boolean {
  const tokens = getXeroTokens()
  if (!tokens) return false
  return Date.now() < tokens.expiresAt
}

export function getXeroAuthUrl(): string {
  const state = Math.random().toString(36).substring(2)
  localStorage.setItem('fg_xero_state', state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'accounting.transactions.read accounting.contacts.read accounting.settings.read offline_access',
    state,
  })

  return `${XERO_AUTH_URL}?${params.toString()}`
}

// Note: Token exchange must happen server-side (client secret cannot be exposed)
// This is handled by /api/xero/callback route

export async function refreshXeroToken(refreshToken: string): Promise<XeroTokens | null> {
  try {
    const response = await fetch('/api/xero/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!response.ok) return null
    const data = await response.json()
    const tokens: XeroTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
      tenantId: data.tenant_id,
      tenantName: data.tenant_name,
    }
    saveXeroTokens(tokens)
    return tokens
  } catch { return null }
}

async function getValidTokens(): Promise<XeroTokens | null> {
  const tokens = getXeroTokens()
  if (!tokens) return null

  // If expires in less than 5 minutes, refresh
  if (Date.now() > tokens.expiresAt - 300000) {
    return await refreshXeroToken(tokens.refreshToken)
  }
  return tokens
}

// Pull bills (accounts payable) from Xero
export async function getXeroBills(_projectTrackingCategory?: string): Promise<unknown[]> {
  const tokens = await getValidTokens()
  if (!tokens) return []

  try {
    const url = `${XERO_API_BASE}/Invoices?Type=ACCPAY&Status=AUTHORISED,PAID`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        'Accept': 'application/json',
      },
    })
    if (!response.ok) return []
    const data = await response.json()
    return data.Invoices || []
  } catch { return [] }
}

// Pull client invoices (accounts receivable) from Xero
export async function getXeroInvoices(): Promise<unknown[]> {
  const tokens = await getValidTokens()
  if (!tokens) return []

  try {
    const url = `${XERO_API_BASE}/Invoices?Type=ACCREC&Status=AUTHORISED,PAID`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        'Accept': 'application/json',
      },
    })
    if (!response.ok) return []
    const data = await response.json()
    return data.Invoices || []
  } catch { return [] }
}

// Get tracking categories (used to map Xero data to projects)
export async function getXeroTrackingCategories(): Promise<unknown[]> {
  const tokens = await getValidTokens()
  if (!tokens) return []

  try {
    const response = await fetch(`${XERO_API_BASE}/TrackingCategories`, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        'Accept': 'application/json',
      },
    })
    if (!response.ok) return []
    const data = await response.json()
    return data.TrackingCategories || []
  } catch { return [] }
}
