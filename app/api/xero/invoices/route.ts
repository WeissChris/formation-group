import { NextRequest, NextResponse } from 'next/server'
import { getValidTokens } from '@/lib/serverXero'

export const runtime = 'nodejs'

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/**
 * Server proxy for Xero client invoices (accounts receivable).
 */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ items: [] }, { status: 403 })
  const tokens = await getValidTokens()
  if (!tokens) return NextResponse.json({ items: [] }, { status: 401 })
  try {
    const url = `${XERO_API_BASE}/Invoices?Type=ACCREC&Status=AUTHORISED,PAID`
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        'Accept': 'application/json',
      },
    })
    if (!resp.ok) return NextResponse.json({ items: [] }, { status: resp.status })
    const data = await resp.json()
    return NextResponse.json({ items: data.Invoices || [] })
  } catch {
    return NextResponse.json({ items: [] }, { status: 502 })
  }
}
