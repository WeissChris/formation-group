// Xero SALES sync - server-only.
//
// Pulls ACCREC (sales) invoices from Xero, matches line items to projects by tracking option
// (same two-stage matcher as the cost sync: option UUID, then category ID + option name - the
// bulk GET /Invoices path omits the UUID), and writes one row per invoice per project to
// fg_xero_project_sales. This fills invoiced-to-date for jobs whose sales invoicing predates
// the platform's progress claims. Readers dedupe against claims by invoice number
// (lib/xeroSales), so this feed is safe to run over platform-invoiced jobs too.
//
// Only AUTHORISED and PAID invoices count - drafts/voided never reach the rollup.
//
// NEVER imported from a client component.

import { supabaseAdmin } from './supabaseAdmin'
import { getValidTokens } from './serverXero'

const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0'

// Same trailing window as the cost sync - old completed jobs age out together.
const LOOKBACK_MONTHS = 24

interface XeroLineItem {
  LineAmount?: number
  Tracking?: Array<{
    TrackingCategoryID?: string
    TrackingOptionID?: string
    Option?: string
  }>
}

export interface XeroSalesInvoice {
  InvoiceID: string
  InvoiceNumber?: string
  Type: string
  Status: string
  Date: string
  LineItems?: XeroLineItem[]
}

export interface SalesRollupRow {
  invoice_id: string
  project_id: string
  invoice_number: string | null
  invoice_date: string | null
  status: string
  total_ex_gst: number
}

export interface SalesSyncResult {
  ok: boolean
  invoices_processed: number
  rows_written: number
  projects_updated: number
  error?: string
}

function parseXeroDate(xeroDateStr: string): string | null {
  const match = xeroDateStr.match(/\/Date\((-?\d+)/)
  if (!match) {
    const d = new Date(xeroDateStr)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  return new Date(parseInt(match[1], 10)).toISOString().slice(0, 10)
}

function xeroDate(d: Date): string {
  return `DateTime(${d.getFullYear()}, ${d.getMonth() + 1}, ${d.getDate()})`
}

const normOpt = (s: string) => s.trim().toLowerCase()

/** Pull ACCREC invoices (authorised + paid) in the lookback window. Paginated, 429-tolerant -
 *  same shape as the cost sync's fetchBills. */
async function fetchSalesInvoices(accessToken: string, tenantId: string, since: Date): Promise<XeroSalesInvoice[]> {
  const where = `Type=="ACCREC"&&Date>=${xeroDate(since)}&&(Status=="AUTHORISED"||Status=="PAID")`
  const collected: XeroSalesInvoice[] = []
  let page = 1
  let retries = 0
  while (page <= 50) {
    const url = `${XERO_API_BASE}/Invoices?where=${encodeURIComponent(where)}&page=${page}&order=Date DESC`
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
    retries = 0
    if (!resp.ok) throw new Error(`Xero sales Invoices page ${page} failed: ${resp.status}`)
    const data = await resp.json()
    const items = data.Invoices || []
    if (items.length === 0) break
    collected.push(...items)
    if (items.length < 100) break
    page++
    await new Promise(r => setTimeout(r, 1500))
  }
  return collected
}

/**
 * One row per (invoice, project): the sum of the invoice's line amounts (ex GST) whose tracking
 * matches that project. A multi-project invoice splits across rows; untracked lines drop.
 * Exported for testability.
 */
export function aggregateSales(
  invoices: XeroSalesInvoice[],
  projectByOptionId: Map<string, string>,
  projectByCatOptName?: Map<string, string>,
): SalesRollupRow[] {
  const rows = new Map<string, SalesRollupRow>()
  for (const inv of invoices) {
    for (const li of inv.LineItems || []) {
      const amount = Number(li.LineAmount) || 0
      if (amount === 0) continue
      let projectId: string | undefined
      for (const t of li.Tracking || []) {
        if (t.TrackingOptionID && projectByOptionId.has(t.TrackingOptionID)) {
          projectId = projectByOptionId.get(t.TrackingOptionID)
          break
        }
        if (projectByCatOptName && t.TrackingCategoryID && t.Option) {
          const key = `${t.TrackingCategoryID}|${normOpt(t.Option)}`
          if (projectByCatOptName.has(key)) { projectId = projectByCatOptName.get(key); break }
        }
      }
      if (!projectId) continue
      const key = `${inv.InvoiceID}|${projectId}`
      const existing = rows.get(key)
      if (existing) existing.total_ex_gst = Math.round((existing.total_ex_gst + amount) * 100) / 100
      else rows.set(key, {
        invoice_id: inv.InvoiceID,
        project_id: projectId,
        invoice_number: inv.InvoiceNumber ?? null,
        invoice_date: parseXeroDate(inv.Date),
        status: inv.Status,
        total_ex_gst: Math.round(amount * 100) / 100,
      })
    }
  }
  // Credit notes aren't in this feed, but a negative-line invoice can net <= 0 - drop those.
  return Array.from(rows.values()).filter(r => r.total_ex_gst > 0)
}

/** Full sales pull: fetch, match, delete + rebuild fg_xero_project_sales. */
export async function runSalesSync(): Promise<SalesSyncResult> {
  if (!supabaseAdmin) return { ok: false, invoices_processed: 0, rows_written: 0, projects_updated: 0, error: 'supabase_admin_not_configured' }
  try {
    const tokens = await getValidTokens()
    if (!tokens) return { ok: false, invoices_processed: 0, rows_written: 0, projects_updated: 0, error: 'no_xero_tokens' }

    const { data: mappingRows } = await supabaseAdmin
      .from('fg_project_xero_mapping')
      .select('project_id, tracking_category_id, tracking_option_id, tracking_option_name')
    const projectByOptionId = new Map<string, string>()
    const projectByCatOptName = new Map<string, string>()
    for (const row of mappingRows || []) {
      projectByOptionId.set(row.tracking_option_id as string, row.project_id as string)
      const cat = row.tracking_category_id as string | null
      const name = row.tracking_option_name as string | null
      if (cat && name) projectByCatOptName.set(`${cat}|${normOpt(name)}`, row.project_id as string)
    }
    if (projectByOptionId.size === 0) return { ok: true, invoices_processed: 0, rows_written: 0, projects_updated: 0 }

    const since = new Date()
    since.setMonth(since.getMonth() - LOOKBACK_MONTHS)
    const invoices = await fetchSalesInvoices(tokens.accessToken, tokens.tenantId, since)
    const rows = aggregateSales(invoices, projectByOptionId, projectByCatOptName)

    // Delete + rebuild - the feed is the source of truth for this window (a voided invoice
    // must disappear on the next sync, which an upsert alone can't do).
    await supabaseAdmin.from('fg_xero_project_sales').delete().neq('invoice_id', '')
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('fg_xero_project_sales').insert(rows)
      if (error) return { ok: false, invoices_processed: invoices.length, rows_written: 0, projects_updated: 0, error: error.message }
    }
    return {
      ok: true,
      invoices_processed: invoices.length,
      rows_written: rows.length,
      projects_updated: new Set(rows.map(r => r.project_id)).size,
    }
  } catch (e) {
    return { ok: false, invoices_processed: 0, rows_written: 0, projects_updated: 0, error: e instanceof Error ? e.message : 'sales_sync_failed' }
  }
}
