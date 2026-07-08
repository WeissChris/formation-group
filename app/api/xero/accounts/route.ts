import { NextRequest, NextResponse } from 'next/server'
import { getValidTokens } from '@/lib/serverXero'
import { isAllowedXccAccount, missingAllowedAccounts, XCC_ALLOWED_ACCOUNTS } from '@/lib/xccAccounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

// A curated bucket with no matching Xero account still needs to be selectable, so it becomes a
// budget-only option whose value is its own name (there's no Xero code to reconcile actuals against).
type Opt = { code: string; name: string; type?: string }
const bucketOpts = (names: string[]): Opt[] => names.map(n => ({ code: n, name: n, type: 'BUCKET' }))
const byName = (x: Opt, y: Opt) => x.name.localeCompare(y.name)

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
  // Xero not connected yet: still return every curated bucket so the picker is complete from day one.
  if (!tokens) return NextResponse.json({ items: bucketOpts(XCC_ALLOWED_ACCOUNTS).sort(byName) })
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
    // Active expense accounts reduced to the curated buckets - these carry real Xero codes so budget
    // reconciles with actual costs.
    const matched: Opt[] = (data.Accounts || [])
      .filter((a: { Class?: string; Status?: string; Code?: string; Name?: string }) =>
        a.Class === 'EXPENSE' && a.Status === 'ACTIVE' && !!a.Code && isAllowedXccAccount(a.Name || ''))
      .map((a: { Code: string; Name: string; Type: string }) => ({ code: a.Code, name: a.Name, type: a.Type }))
    // Any curated bucket Xero has no account for is added as a budget-only option, so ALL of the list
    // is always selectable (Chris allocates budget to it; there are simply no Xero actuals to match).
    const items = [...matched, ...bucketOpts(missingAllowedAccounts(matched.map(m => m.name)))].sort(byName)
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch {
    return NextResponse.json({ items: [] }, { status: 502 })
  }
}
