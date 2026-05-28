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
 * GET /api/xero/tracking-options
 *
 * Returns Xero's tracking categories with their options, e.g.:
 *   [{ id: 'cat-uuid', name: 'Project', options: [{ id: 'opt-uuid', name: 'Clifton St' }, ...] }]
 *
 * Used by the Settings mapping UI to populate the per-project dropdown.
 */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ items: [] }, { status: 403 })
  }
  const tokens = await getValidTokens()
  if (!tokens) return NextResponse.json({ items: [] }, { status: 401 })
  try {
    const resp = await fetch(`${XERO_API_BASE}/TrackingCategories`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        Accept: 'application/json',
      },
    })
    if (!resp.ok) return NextResponse.json({ items: [] }, { status: resp.status })
    const data = await resp.json()
    const cats = (data.TrackingCategories || []).map((c: { TrackingCategoryID: string; Name: string; Options?: Array<{ TrackingOptionID: string; Name: string }> }) => ({
      id: c.TrackingCategoryID,
      name: c.Name,
      options: (c.Options || []).map(o => ({ id: o.TrackingOptionID, name: o.Name })),
    }))
    return NextResponse.json({ items: cats })
  } catch {
    return NextResponse.json({ items: [] }, { status: 502 })
  }
}
