import { NextRequest, NextResponse } from 'next/server'
import { getValidTokens } from '@/lib/serverXero'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
 * GET /api/xero/accounts  (Formation Xero — same-origin)
 *
 * Returns the active EXPENSE-class accounts from the Chart of Accounts — the cost codes a line item is
 * allocated to for the project budget. Class 'EXPENSE' covers DIRECTCOSTS (cost of sales), OVERHEADS,
 * EXPENSE and WAGESEXPENSE, which is the full set Chris budgets against; revenue/asset/liability
 * accounts are filtered out so the picker stays clean. Reuses accounting.settings.read (already granted
 * for the cost feed). Shape: [{ code, name, type }].
 */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ items: [] }, { status: 403 })
  const tokens = await getValidTokens('formation')
  if (!tokens) return NextResponse.json({ items: [] }, { status: 401 })
  try {
    const resp = await fetch(`${XERO_API_BASE}/Accounts`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Xero-tenant-id': tokens.tenantId,
        Accept: 'application/json',
      },
    })
    if (!resp.ok) return NextResponse.json({ items: [] }, { status: resp.status })
    const data = await resp.json()
    const items = (data.Accounts || [])
      .filter((a: { Class?: string; Status?: string; Code?: string }) => a.Class === 'EXPENSE' && a.Status === 'ACTIVE' && !!a.Code)
      .map((a: { Code: string; Name: string; Type: string }) => ({ code: a.Code, name: a.Name, type: a.Type }))
      .sort((x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name))
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch {
    return NextResponse.json({ items: [] }, { status: 502 })
  }
}
