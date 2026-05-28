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
 * Xero account classes that count as cost of sales for the GP calculation.
 * Anything outside this allowlist (EXPENSE, OVERHEAD, etc) is ignored at write time —
 * the guardrail that prevents NP / operating expense data leaking into the platform.
 *
 * Xero's account `Class` enum values:
 *   ASSET, EQUITY, EXPENSE, LIABILITY, REVENUE
 *   (and the subset Class.DIRECTCOSTS for COGS)
 *
 * We allow DIRECTCOSTS only. EXPENSE = operating expenses = excluded.
 */
const ALLOWED_ACCOUNT_CLASSES = new Set(['DIRECTCOSTS'])

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
  Class: string  // 'EXPENSE', 'DIRECTCOSTS', 'REVENUE', etc.
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

export interface SyncResult {
  ok: boolean
  bills_processed: number
  spend_money_processed: number
  projects_updated: number
  error?: string
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
    if (!resp.ok) throw new Error(`Xero Invoices page ${page} failed: ${resp.status}`)
    const data = await resp.json()
    const items = data.Invoices || []
    if (items.length === 0) break
    collected.push(...items)
    if (items.length < 100) break  // last page (Xero pages of 100)
    page++
    // Polite delay — Xero rate limit is 60/min. 1.1s between pages = safe.
    await new Promise(r => setTimeout(r, 1100))
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
  while (page <= 50) {
    const url = `${XERO_API_BASE}/BankTransactions?where=${encodeURIComponent(where)}&page=${page}&order=Date DESC`
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        Accept: 'application/json',
      },
    })
    if (!resp.ok) throw new Error(`Xero BankTransactions page ${page} failed: ${resp.status}`)
    const data = await resp.json()
    const items = data.BankTransactions || []
    if (items.length === 0) break
    collected.push(...items)
    if (items.length < 100) break
    page++
    await new Promise(r => setTimeout(r, 1100))
  }
  return collected
}

/**
 * Aggregate raw Xero transactions into per-project, per-account cost rollups.
 *
 * Inputs:
 *   - transactions: bills + spend money already flattened to {date, lineItems}
 *   - projectByOptionId: map of TrackingOptionID → projectId (from fg_project_xero_mapping)
 *   - accountByCode: map of AccountCode → {name, class} (from Xero Accounts)
 *
 * Output: array of CostRollupRow ready to upsert into fg_xero_project_costs.
 *
 * Guardrail: a line item only contributes if its account class is in ALLOWED_ACCOUNT_CLASSES.
 * This is the layer that enforces "GP only, never NP" — operating expenses can never reach
 * the cost rollup even if mis-tagged with a project tracking option.
 *
 * Exported for testability.
 */
export function aggregateCosts(
  transactions: Array<{ date: string; lineItems: XeroLineItem[] }>,
  projectByOptionId: Map<string, string>,
  accountByCode: Map<string, XeroAccount>,
): CostRollupRow[] {
  // {projectId|accountCode → {amount, count, lastDate}}
  const acc = new Map<string, {
    project_id: string
    account_code: string
    account_name: string
    amount: number
    count: number
    lastDate: string | null
  }>()

  for (const tx of transactions) {
    for (const li of tx.lineItems || []) {
      const code = li.AccountCode
      const amount = Number(li.LineAmount) || 0
      if (!code || amount === 0) continue

      // GP-only guardrail — drop anything that isn't a direct cost of sales
      const account = accountByCode.get(code)
      if (!account || !ALLOWED_ACCOUNT_CLASSES.has(account.Class)) continue

      // Find the project this line item is tagged to (via Tracking[].TrackingOptionID)
      const tracking = li.Tracking || []
      let projectId: string | undefined
      for (const t of tracking) {
        if (t.TrackingOptionID && projectByOptionId.has(t.TrackingOptionID)) {
          projectId = projectByOptionId.get(t.TrackingOptionID)
          break
        }
      }
      if (!projectId) continue  // not tagged to any tracked project — skip silently

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
          account_name: account.Name,
          amount,
          count: 1,
          lastDate: tx.date || null,
        })
      }
    }
  }

  return Array.from(acc.values()).map(v => ({
    project_id: v.project_id,
    account_code: v.account_code,
    account_name: v.account_name,
    amount_ex_gst: Math.round(v.amount * 100) / 100,
    bill_count: v.count,
    // Xero's Date field comes as "/Date(1716115200000+0000)/" — parse and reformat
    last_bill_date: v.lastDate ? parseXeroDate(v.lastDate) : null,
  }))
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

    // Load the project mapping table
    const { data: mappingRows } = await supabaseAdmin
      .from('fg_project_xero_mapping')
      .select('project_id, tracking_option_id')
    const projectByOptionId = new Map<string, string>()
    for (const row of mappingRows || []) {
      projectByOptionId.set(row.tracking_option_id as string, row.project_id as string)
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

    const rollup = aggregateCosts(transactions, projectByOptionId, accountByCode)

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
    }
    await finalize('ok', result)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error'
    await finalize('error', { error_message: message })
    return { ok: false, bills_processed: 0, spend_money_processed: 0, projects_updated: 0, error: message }
  }
}
