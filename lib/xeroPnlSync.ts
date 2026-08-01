// Company monthly P&L sync - server-only. Pulls the WHOLE-COMPANY Profit & Loss from Xero
// (no tracking filter), buckets each month by account class into revenue / cost of sales /
// overheads (lib/companyPnl.parseCompanyPnl) and upserts fg_company_pnl_months.
//
// This is deliberately a SEPARATE pipe from lib/xeroCostSync: the project cost feed stays
// GP-only forever (overheads never land in any project/site table); the company months are
// service-role only and surface exclusively through the director-gated /company page.
//
// Scope: accounting.reports.profitandloss.read - already granted by the standard connect,
// so no reconnect is needed.
//
// Pull policy: last LOOKBACK_MONTHS calendar months (Melbourne). Months already stored are
// skipped except the most recent REFRESH_RECENT_MONTHS, which are re-pulled every run so
// late bills/journals settle. Steady state = 3 report calls per run; the first run backfills
// the lot (one call per month, 1.2s politeness, same 429 handling as the cost sync).

import { getValidTokens } from './serverXero'
import { supabaseAdmin } from './supabaseAdmin'
import { melbourneISODate } from './snapshots'
import { parseCompanyPnl, type AccountClassInfo, type PnlReport } from './companyPnl'

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'
const LOOKBACK_MONTHS = 24
const REFRESH_RECENT_MONTHS = 3

export interface CompanyPnlSyncResult {
  ok: boolean
  months_pulled: number
  months_skipped: number
  unmatched_rows: number
  error?: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

async function fetchAccountsById(accessToken: string, tenantId: string): Promise<Map<string, AccountClassInfo>> {
  const resp = await fetch(`${XERO_API_BASE}/Accounts`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' },
  })
  if (!resp.ok) throw new Error(`Xero Accounts pull failed: ${resp.status}`)
  const data = await resp.json()
  const map = new Map<string, AccountClassInfo>()
  for (const acc of data.Accounts || []) {
    if (acc.AccountID) map.set(acc.AccountID, { cls: acc.Class || '', type: acc.Type || '', name: acc.Name || acc.Code || '' })
  }
  return map
}

async function fetchCompanyPnl(
  accessToken: string,
  tenantId: string,
  fromDate: string,   // YYYY-MM-DD
  toDate: string,     // YYYY-MM-DD
): Promise<PnlReport> {
  const params = new URLSearchParams({ fromDate, toDate })
  const url = `${XERO_API_BASE}/Reports/ProfitAndLoss?${params.toString()}`
  let retries = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' },
    })
    if (resp.status === 429) {
      if (retries >= 2) throw new Error('rate_limited')
      retries++
      const retryAfter = parseInt(resp.headers.get('retry-after') || '60', 10)
      await new Promise(r => setTimeout(r, (retryAfter + 5) * 1000))
      continue
    }
    if (!resp.ok) {
      let detail = ''
      try { detail = (await resp.text()).slice(0, 300) } catch { /* ignore */ }
      throw new Error(`Xero ProfitAndLoss failed: ${resp.status} ${detail}`)
    }
    return resp.json()
  }
}

/** The last `count` month starts up to and including the month containing `todayIso`, oldest first. */
export function monthStarts(todayIso: string, count: number): string[] {
  const year = Number(todayIso.slice(0, 4))
  const month = Number(todayIso.slice(5, 7))   // 1-12
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    const total = year * 12 + (month - 1) - i
    const y = Math.floor(total / 12)
    const m = (total % 12) + 1
    out.push(`${y}-${String(m).padStart(2, '0')}-01`)
  }
  return out
}

/** Last day of the month that starts at `monthIso` (YYYY-MM-01), as YYYY-MM-DD. */
export function monthEnd(monthIso: string): string {
  const y = Number(monthIso.slice(0, 4))
  const m = Number(monthIso.slice(5, 7))
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()   // day 0 of next month
  return `${monthIso.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
}

export async function runCompanyPnlSync(): Promise<CompanyPnlSyncResult> {
  if (!supabaseAdmin) return { ok: false, months_pulled: 0, months_skipped: 0, unmatched_rows: 0, error: 'supabase_admin_not_configured' }
  const tokens = await getValidTokens('formation')
  if (!tokens) return { ok: false, months_pulled: 0, months_skipped: 0, unmatched_rows: 0, error: 'no_xero_tokens' }

  const todayIso = melbourneISODate()
  const allMonths = monthStarts(todayIso, LOOKBACK_MONTHS)
  const recent = new Set(allMonths.slice(-REFRESH_RECENT_MONTHS))

  const { data: existingRows, error: readError } = await supabaseAdmin
    .from('fg_company_pnl_months')
    .select('month')
    .eq('entity', 'formation')
  if (readError) return { ok: false, months_pulled: 0, months_skipped: 0, unmatched_rows: 0, error: readError.message }
  const existing = new Set((existingRows ?? []).map(r => String(r.month).slice(0, 10)))

  const toPull = allMonths.filter(m => recent.has(m) || !existing.has(m))
  if (toPull.length === 0) return { ok: true, months_pulled: 0, months_skipped: allMonths.length, unmatched_rows: 0 }

  try {
    const accountsById = await fetchAccountsById(tokens.accessToken, tokens.tenantId)
    let pulled = 0
    let unmatched = 0
    for (const monthIso of toPull) {
      const report = await fetchCompanyPnl(tokens.accessToken, tokens.tenantId, monthIso, monthEnd(monthIso))
      const totals = parseCompanyPnl(report, accountsById)
      unmatched += totals.unmatchedRows
      const grossProfit = round2(totals.revenue - totals.costOfSales)
      const { error } = await supabaseAdmin.from('fg_company_pnl_months').upsert({
        month: monthIso,
        entity: 'formation',
        revenue: totals.revenue,
        cost_of_sales: totals.costOfSales,
        gross_profit: grossProfit,
        overheads: totals.overheads,
        net_profit: round2(grossProfit - totals.overheads),
        overheads_by_account: totals.overheadsByAccount,
        pulled_at: new Date().toISOString(),
      }, { onConflict: 'month,entity' })
      if (error) return { ok: false, months_pulled: pulled, months_skipped: allMonths.length - toPull.length, unmatched_rows: unmatched, error: error.message }
      pulled++
      // Polite delay - Xero rate limit is 60 calls/min.
      await new Promise(r => setTimeout(r, 1200))
    }
    return { ok: true, months_pulled: pulled, months_skipped: allMonths.length - toPull.length, unmatched_rows: unmatched }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'company_pnl_sync_failed'
    return { ok: false, months_pulled: 0, months_skipped: 0, unmatched_rows: 0, error: msg.includes('rate_limited') ? 'rate_limited' : msg }
  }
}
