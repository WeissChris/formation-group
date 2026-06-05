// Xero cost sync — server-only.
//
// Pulls Bills (ACCPAY invoices) and Spend Money transactions from Xero, filters by each
// mapped project's tracking option, enforces a GP-only guardrail (cost-of-sales accounts
// only — never operating expenses, director comp, overheads), aggregates by Xero account,
// and writes the rollup to `fg_xero_project_costs` via supabaseAdmin.
//
// Run by:
//   - POST /api/xero/sync-now (manual button)
//   - GitHub Action hourly (Phase 4 — not yet wired)
//   - End-of-month snapshot cron (Phase 4)
//
// NEVER imported from a client component.

import { supabaseAdmin } from './supabaseAdmin'
import { getValidTokens } from './serverXero'

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

// 24-month trailing window. Older spend rarely matters for active jobs.
const LOOKBACK_MONTHS = 24

/**
 * GP-only guardrail: which Xero accounts count as cost of sales (job cost), so operating
 * expenses / overheads / director comp can never reach the per-project rollup.
 *
 * IMPORTANT — Xero data model:
 *   - account.Class is one of: ASSET, EQUITY, EXPENSE, LIABILITY, REVENUE
 *   - account.Type is the granular kind: DIRECTCOSTS, OVERHEADS, EXPENSE, DEPRECIATN,
 *     WAGESEXPENSE, SUPERANNUATIONEXPENSE, ...
 *
 * "Cost of Sales" on a Xero P&L = accounts with Type === 'DIRECTCOSTS'. (An earlier version
 * of this code wrongly checked Class === 'DIRECTCOSTS', which is never true — so every line
 * item was silently dropped and 0 cost rows were ever written.)
 *
 * `COST_OF_SALES_TYPES` is the allowlist of account Types we treat as job cost. It can be
 * widened (e.g. to include production WAGESEXPENSE / SUPERANNUATIONEXPENSE) once we've
 * confirmed from the diagnostic breakdown how Chris's chart of accounts is structured.
 */
const COST_OF_SALES_TYPES = new Set([
  'DIRECTCOSTS',
])

function isCostOfSales(account: XeroAccount | undefined): boolean {
  if (!account) return false
  return COST_OF_SALES_TYPES.has(account.Type)
}

interface XeroLineItem {
  AccountCode?: string
  LineAmount?: number
  Tracking?: Array<{
    TrackingCategoryID?: string
    TrackingOptionID?: string
    Name?: string
    Option?: string
  }>
}

interface XeroInvoice {
  InvoiceID: string
  Type: 'ACCPAY' | 'ACCREC'
  Status: string
  Date: string
  Reference?: string
  LineItems?: XeroLineItem[]
}

interface XeroBankTransaction {
  BankTransactionID: string
  Type: string  // 'SPEND' for spend-money
  Status: string
  Date: string
  LineItems?: XeroLineItem[]
}

interface XeroAccount {
  AccountID: string
  Code: string
  Name: string
  Class: string  // ASSET | EQUITY | EXPENSE | LIABILITY | REVENUE
  Type: string   // DIRECTCOSTS | OVERHEADS | EXPENSE | WAGESEXPENSE | ... (the granular kind)
}

/** Result row written to fg_xero_project_costs. */
interface CostRollupRow {
  project_id: string
  account_code: string
  account_name: string
  amount_ex_gst: number
  bill_count: number
  last_bill_date: string | null
}

/**
 * Diagnostic breakdown emitted by aggregateCosts so we can see WHY a pull produced the row
 * count it did — isolates "tracking didn't match" from "account filter dropped everything".
 */
export interface AggregateDiagnostics {
  lineItemsTotal: number
  lineItemsWithTracking: number      // line items that carry ANY Tracking entry at all
  lineItemsTrackingMatched: number   // tagged to a known project (before cost-account filter)
  lineItemsCostFiltered: number      // also passed the cost-of-sales filter (these get written)
  /** Up to 12 distinct (categoryId → optionId) tracking pairs seen on line items — lets us
   *  compare what's actually on the bills against the stored mapping IDs. */
  sampleTrackingPairs: string[]
  /** Raw JSON of the first line item that has an account code — reveals the exact field shape
   *  Xero returns (esp. whether Tracking is present in the paged list response). */
  sampleRawLineItem: string | null
  /** For every tracking-matched line item, $ and count by account Type. */
  trackedTypeBreakdown: Record<string, { count: number; amount: number; sampleName: string }>
}

export interface SyncResult {
  ok: boolean
  bills_processed: number
  spend_money_processed: number
  projects_updated: number
  error?: string
  diagnostics?: AggregateDiagnostics
}

/**
 * Format a date as Xero's expected query format: "DateTime(2024,01,01)".
 */
function xeroDate(d: Date): string {
  return `DateTime(${d.getFullYear()},${d.getMonth() + 1},${d.getDate()})`
}

/** Pull all Xero accounts so we can resolve account code → name + class. */
async function fetchAccounts(accessToken: string, tenantId: string): Promise<Map<string, XeroAccount>> {
  const resp = await fetch(`${XERO_API_BASE}/Accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  if (!resp.ok) throw new Error(`Xero Accounts pull failed: ${resp.status}`)
  const data = await resp.json()
  const map = new Map<string, XeroAccount>()
  for (const acc of data.Accounts || []) {
    if (acc.Code) map.set(acc.Code, acc as XeroAccount)
  }
  return map
}

/** Pull ACCPAY invoices in the lookback window. Paginated. */
async function fetchBills(
  accessToken: string,
  tenantId: string,
  since: Date,
): Promise<XeroInvoice[]> {
  const where = `Type=="ACCPAY"&&Date>=${xeroDate(since)}`
  const collected: XeroInvoice[] = []
  let page = 1
  let retries = 0
  // Hard cap so a misconfig can't loop forever
  while (page <= 50) {
    const url = `${XERO_API_BASE}/Invoices?where=${encodeURIComponent(where)}&page=${page}&order=Date DESC`
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })
    if (resp.status === 429) {
      if (retries >= 2) throw new Error('rate_limited')  // give up cleanly after 2 retries
      retries++
      const retryAfter = parseInt(resp.headers.get('retry-after') || '60', 10)
      await new Promise(r => setTimeout(r, (retryAfter + 5) * 1000))
      continue  // retry the same page
    }
    retries = 0  // reset on success
    if (!resp.ok) throw new Error(`Xero Invoices page ${page} failed: ${resp.status}`)
    const data = await resp.json()
    const items = data.Invoices || []
    if (items.length === 0) break
    collected.push(...items)
    if (items.length < 100) break  // last page (Xero pages of 100)
    page++
    // Polite delay — Xero rate limit is 60 calls/min. 1.5s per page stays comfortably under.
    await new Promise(r => setTimeout(r, 1500))
  }
  return collected
}

/** Pull Spend Money transactions in the lookback window. Paginated. */
async function fetchSpendMoney(
  accessToken: string,
  tenantId: string,
  since: Date,
): Promise<XeroBankTransaction[]> {
  const where = `Type=="SPEND"&&Date>=${xeroDate(since)}`
  const collected: XeroBankTransaction[] = []
  let page = 1
  let retries = 0
  while (page <= 50) {
    const url = `${XERO_API_BASE}/BankTransactions?where=${encodeURIComponent(where)}&page=${page}&order=Date DESC`
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })
    if (resp.status === 429) {
      if (retries >= 2) throw new Error('rate_limited')
      retries++
      const retryAfter = parseInt(resp.headers.get('retry-after') || '60', 10)
      await new Promise(r => setTimeout(r, (retryAfter + 5) * 1000))
      continue
    }
    retries = 0
    if (!resp.ok) throw new Error(`Xero BankTransactions page ${page} failed: ${resp.status}`)
    const data = await resp.json()
    const items = data.BankTransactions || []
    if (items.length === 0) break
    collected.push(...items)
    if (items.length < 100) break
    page++
    await new Promise(r => setTimeout(r, 1500))
  }
  return collected
}

/**
 * Aggregate raw Xero transactions into per-project, per-account cost rollups.
 *
 * Inputs:
 *   - transactions: bills + spend money already flattened to {date, lineItems}
 *   - projectByOptionId: map of TrackingOptionID → projectId
 *   - accountByCode: map of AccountCode → account (from Xero Accounts)
 *   - projectByCatOptName: map of `${categoryId}|${normalizedOptionName}` → projectId.
 *       REQUIRED in practice — Xero's bulk GET /Invoices returns line-item tracking with the
 *       category ID + option NAME but NOT the option UUID, so name-matching is the path that
 *       actually fires. The option-ID map is kept as a fallback for endpoints that do return it.
 *
 * Output: { rows, diagnostics }. rows are ready to upsert into fg_xero_project_costs.
 *
 * Guardrail order (important): we first check the line item is tagged to a known project
 * (the real GP signal — operating expenses like rent / director wages are never job-tagged),
 * THEN apply the cost-of-sales account-Type filter as a backstop so a mis-tagged overhead
 * can't leak into the rollup. Diagnostics record both stages so a 0-row result is debuggable.
 *
 * Exported for testability.
 */
function normOpt(s: string): string {
  return s.trim().toLowerCase()
}

export function aggregateCosts(
  transactions: Array<{ date: string; lineItems: XeroLineItem[] }>,
  projectByOptionId: Map<string, string>,
  accountByCode: Map<string, XeroAccount>,
  projectByCatOptName?: Map<string, string>,
): { rows: CostRollupRow[]; diagnostics: AggregateDiagnostics } {
  // {projectId|accountCode → {amount, count, lastDate}}
  const acc = new Map<string, {
    project_id: string
    account_code: string
    account_name: string
    amount: number
    count: number
    lastDate: string | null
  }>()

  const diag: AggregateDiagnostics = {
    lineItemsTotal: 0,
    lineItemsWithTracking: 0,
    lineItemsTrackingMatched: 0,
    lineItemsCostFiltered: 0,
    sampleTrackingPairs: [],
    sampleRawLineItem: null,
    trackedTypeBreakdown: {},
  }
  const seenTrackingPairs = new Set<string>()

  for (const tx of transactions) {
    for (const li of tx.lineItems || []) {
      diag.lineItemsTotal++
      const code = li.AccountCode
      const amount = Number(li.LineAmount) || 0
      if (!code || amount === 0) continue

      // Capture the raw shape of the first real line item, once.
      if (diag.sampleRawLineItem === null) {
        try { diag.sampleRawLineItem = JSON.stringify(li).slice(0, 800) } catch { /* ignore */ }
      }

      // Stage 1 — must be tagged to a tracked project (the real GP-only signal)
      const tracking = li.Tracking || []
      if (tracking.length > 0) {
        diag.lineItemsWithTracking++
        for (const t of tracking) {
          if (seenTrackingPairs.size < 12 && (t.TrackingCategoryID || t.TrackingOptionID)) {
            seenTrackingPairs.add(`${t.TrackingCategoryID || '?'}:${t.TrackingOptionID || '?'}`)
          }
        }
      }
      let projectId: string | undefined
      for (const t of tracking) {
        // (a) Match by option UUID when Xero provides it.
        if (t.TrackingOptionID && projectByOptionId.has(t.TrackingOptionID)) {
          projectId = projectByOptionId.get(t.TrackingOptionID)
          break
        }
        // (b) Match by category ID + option NAME — the path that fires for bulk GET /Invoices,
        // which omits the option UUID but includes TrackingCategoryID + Option (the name).
        if (projectByCatOptName && t.TrackingCategoryID && t.Option) {
          const key = `${t.TrackingCategoryID}|${normOpt(t.Option)}`
          if (projectByCatOptName.has(key)) {
            projectId = projectByCatOptName.get(key)
            break
          }
        }
      }
      if (!projectId) continue  // not tagged to any tracked project — skip silently
      diag.lineItemsTrackingMatched++

      // Record the account-Type breakdown for ALL tracking-matched line items, so we can
      // see what types real job costs use even if the filter below rejects some.
      const account = accountByCode.get(code)
      const acctType = account?.Type || 'UNKNOWN'
      const b = diag.trackedTypeBreakdown[acctType] || { count: 0, amount: 0, sampleName: account?.Name || code }
      b.count++
      b.amount = Math.round((b.amount + amount) * 100) / 100
      diag.trackedTypeBreakdown[acctType] = b

      // Stage 2 — backstop: only cost-of-sales accounts are written (GP only, never NP)
      if (!isCostOfSales(account)) continue
      diag.lineItemsCostFiltered++

      const key = `${projectId}|${code}`
      const existing = acc.get(key)
      if (existing) {
        existing.amount += amount
        existing.count += 1
        if (!existing.lastDate || tx.date > existing.lastDate) existing.lastDate = tx.date
      } else {
        acc.set(key, {
          project_id: projectId,
          account_code: code,
          account_name: account!.Name,
          amount,
          count: 1,
          lastDate: tx.date || null,
        })
      }
    }
  }

  diag.sampleTrackingPairs = Array.from(seenTrackingPairs)

  const rows = Array.from(acc.values()).map(v => ({
    project_id: v.project_id,
    account_code: v.account_code,
    account_name: v.account_name,
    amount_ex_gst: Math.round(v.amount * 100) / 100,
    bill_count: v.count,
    // Xero's Date field comes as "/Date(1716115200000+0000)/" — parse and reformat
    last_bill_date: v.lastDate ? parseXeroDate(v.lastDate) : null,
  }))

  return { rows, diagnostics: diag }
}

/** Convert Xero's "/Date(1716115200000+0000)/" wire format to "YYYY-MM-DD" local. */
function parseXeroDate(xeroDateStr: string): string | null {
  const match = xeroDateStr.match(/\/Date\((-?\d+)/)
  if (!match) {
    // Could also be a regular ISO string — try parsing
    const d = new Date(xeroDateStr)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  const ms = parseInt(match[1], 10)
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Full sync — pulls everything for all mapped projects, replaces the cost cache.
 *
 * Strategy: bulk-replace per project. We delete existing rollup rows for each project
 * that we computed costs for, then insert the new rows. Projects with no costs in the
 * lookback window get their rows deleted (no data is correct data).
 */
export async function runFullSync(
  trigger: 'manual' | 'cron_hourly' | 'cron_month_end' = 'manual',
): Promise<SyncResult> {
  if (!supabaseAdmin) {
    return { ok: false, bills_processed: 0, spend_money_processed: 0, projects_updated: 0, error: 'supabase_admin_not_configured' }
  }

  // Open a pull-run row so the UI shows "in progress"
  const { data: runRow } = await supabaseAdmin
    .from('fg_xero_pull_runs')
    .insert({ trigger, status: 'running' })
    .select('id')
    .single()
  const runId = runRow?.id as number | undefined

  const finalize = async (status: 'ok' | 'error', extra: Partial<SyncResult> & { error_message?: string }) => {
    if (runId == null) return
    await supabaseAdmin!
      .from('fg_xero_pull_runs')
      .update({
        finished_at: new Date().toISOString(),
        status,
        bills_processed: extra.bills_processed ?? 0,
        projects_updated: extra.projects_updated ?? 0,
        error_message: extra.error_message ?? null,
      })
      .eq('id', runId)
  }

  try {
    const tokens = await getValidTokens()
    if (!tokens) {
      await finalize('error', { error_message: 'no_xero_tokens' })
      return { ok: false, bills_processed: 0, spend_money_processed: 0, projects_updated: 0, error: 'no_xero_tokens' }
    }

    // Load the project mapping table. We build two matchers:
    //   - projectByOptionId        : option UUID → projectId (used when Xero returns the UUID)
    //   - projectByCatOptName       : `${categoryId}|${normalizedOptionName}` → projectId
    //                                 (the path that fires for bulk GET /Invoices, which omits
    //                                  the option UUID but includes the category ID + option name)
    const { data: mappingRows } = await supabaseAdmin
      .from('fg_project_xero_mapping')
      .select('project_id, tracking_category_id, tracking_option_id, tracking_option_name')
    const projectByOptionId = new Map<string, string>()
    const projectByCatOptName = new Map<string, string>()
    for (const row of mappingRows || []) {
      projectByOptionId.set(row.tracking_option_id as string, row.project_id as string)
      const cat = row.tracking_category_id as string | null
      const name = row.tracking_option_name as string | null
      if (cat && name) {
        projectByCatOptName.set(`${cat}|${name.trim().toLowerCase()}`, row.project_id as string)
      }
    }
    if (projectByOptionId.size === 0) {
      await finalize('ok', { bills_processed: 0, projects_updated: 0 })
      return { ok: true, bills_processed: 0, spend_money_processed: 0, projects_updated: 0 }
    }

    // Pull accounts (small — single page, no pagination)
    const accountByCode = await fetchAccounts(tokens.accessToken, tokens.tenantId)

    // Compute the lookback window
    const since = new Date()
    since.setMonth(since.getMonth() - LOOKBACK_MONTHS)

    // Pull bills + spend money in parallel
    const [bills, spend] = await Promise.all([
      fetchBills(tokens.accessToken, tokens.tenantId, since),
      fetchSpendMoney(tokens.accessToken, tokens.tenantId, since),
    ])

    // Flatten to a uniform shape for aggregation
    const transactions = [
      ...bills.map(b => ({ date: b.Date, lineItems: b.LineItems || [] })),
      ...spend.map(s => ({ date: s.Date, lineItems: s.LineItems || [] })),
    ]

    const { rows: rollup, diagnostics } = aggregateCosts(transactions, projectByOptionId, accountByCode, projectByCatOptName)

    // Replace-per-project: delete old rollup rows for any project we have new data for,
    // then insert the new rows.
    const projectsWithNewData = new Set(rollup.map(r => r.project_id))
    if (projectsWithNewData.size > 0) {
      await supabaseAdmin
        .from('fg_xero_project_costs')
        .delete()
        .in('project_id', Array.from(projectsWithNewData))
    }

    if (rollup.length > 0) {
      const insertPayload = rollup.map(r => ({
        ...r,
        pulled_at: new Date().toISOString(),
      }))
      await supabaseAdmin.from('fg_xero_project_costs').insert(insertPayload)
    }

    const result: SyncResult = {
      ok: true,
      bills_processed: bills.length,
      spend_money_processed: spend.length,
      projects_updated: projectsWithNewData.size,
      diagnostics,
    }
    // Stash diagnostics in the run log's error_message field (it's null on success anyway)
    // so we can read the account-type breakdown straight from fg_xero_pull_runs.
    await finalize('ok', { ...result, error_message: JSON.stringify(diagnostics) })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error'
    await finalize('error', { error_message: message })
    return { ok: false, bills_processed: 0, spend_money_processed: 0, projects_updated: 0, error: message }
  }
}
