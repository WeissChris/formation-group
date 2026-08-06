import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isLabourAccount } from '@/lib/labour'

export const runtime = 'nodejs'

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
 * GET /api/xero/live-jobs
 *
 * Returns one row per active project with the columns the Live Jobs dashboard needs.
 * The dashboard combines this with localStorage data (estimates, progress claims, baseline)
 * to compute the final view — this endpoint only owns the parts that come from the server
 * (cost-to-date, last sync time, mapping status).
 */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ items: [], configured: false }, { status: 403 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ items: [], configured: false })
  }

  const [{ data: costs }, { data: forecasts }, { data: mappings }, { data: salesRows }] = await Promise.all([
    supabaseAdmin.from('fg_xero_project_costs').select('project_id, account_code, account_name, amount_ex_gst, pulled_at'),
    supabaseAdmin.from('fg_project_cost_forecast').select('project_id, account_code, forecast_final'),
    supabaseAdmin.from('fg_project_xero_mapping').select('project_id, tracking_option_name'),
    supabaseAdmin.from('fg_xero_project_sales').select('project_id, invoice_number, invoice_date, total_ex_gst'),
  ])

  // Sales (ACCREC) invoices per project - the client dedupes against platform claims by
  // invoice number (lib/xeroSales), so pass the per-invoice rows through, not just a total.
  const salesByProject = new Map<string, Array<{ invoice_number: string | null; invoice_date: string | null; total_ex_gst: number }>>()
  for (const s of salesRows || []) {
    const pid = s.project_id as string
    const list = salesByProject.get(pid) ?? []
    list.push({ invoice_number: (s.invoice_number as string | null) ?? null, invoice_date: (s.invoice_date as string | null) ?? null, total_ex_gst: Number(s.total_ex_gst) || 0 })
    salesByProject.set(pid, list)
  }

  // Aggregate cost-to-date per project, and per-account so forecast overrides work.
  // Also split by discipline (labour / subbies / materials+equipment) via the account name -
  // same matchers as lib/projectMetrics - so the portfolio report can say where money goes.
  type AccountCost = { account_code: string; actual: number; forecast?: number | null }
  const perProject = new Map<string, { actual: number; labour: number; subbies: number; materials: number; accounts: Map<string, AccountCost>; lastPulled: string | null }>()

  for (const c of costs || []) {
    const pid = c.project_id as string
    if (!perProject.has(pid)) perProject.set(pid, { actual: 0, labour: 0, subbies: 0, materials: 0, accounts: new Map(), lastPulled: null })
    const slot = perProject.get(pid)!
    const amount = Number(c.amount_ex_gst)
    slot.actual += amount
    const name = (c.account_name as string) || ''
    if (isLabourAccount(name)) slot.labour += amount
    else if (/subcontract/i.test(name)) slot.subbies += amount
    else slot.materials += amount
    slot.accounts.set(c.account_code as string, { account_code: c.account_code as string, actual: amount })
    const pulled = c.pulled_at as string
    if (!slot.lastPulled || pulled > slot.lastPulled) slot.lastPulled = pulled
  }

  // Projects with at least one explicit forecast override - a deliberate human forecast.
  // Without one, forecast_final_cost is just cost restated, and the client (computeLiveJobRow)
  // prefers the gantt plan cost instead.
  const overrideProjects = new Set<string>()
  for (const f of forecasts || []) {
    const pid = f.project_id as string
    if (f.forecast_final != null) overrideProjects.add(pid)
    const slot = perProject.get(pid)
    if (!slot) continue
    const acc = slot.accounts.get(f.account_code as string)
    if (acc) acc.forecast = f.forecast_final != null ? Number(f.forecast_final) : null
  }

  const items = Array.from(perProject.entries()).map(([projectId, slot]) => {
    // Forecast final cost per account: explicit override OR actual (we don't know budget here)
    const forecastFinalCost = Array.from(slot.accounts.values()).reduce(
      (sum, a) => sum + (a.forecast != null ? a.forecast : a.actual),
      0,
    )
    return {
      project_id: projectId,
      cost_to_date: Math.round(slot.actual * 100) / 100,
      forecast_final_cost: Math.round(forecastFinalCost * 100) / 100,
      cost_labour: Math.round(slot.labour * 100) / 100,
      cost_subbies: Math.round(slot.subbies * 100) / 100,
      cost_materials: Math.round(slot.materials * 100) / 100,
      last_pulled_at: slot.lastPulled,
      mapped: true,
      has_overrides: overrideProjects.has(projectId),
      sales: salesByProject.get(projectId) ?? [],
    }
  })

  // Also include mapped projects with zero spend so the dashboard knows they're mapped
  for (const m of mappings || []) {
    const pid = m.project_id as string
    if (!items.find(i => i.project_id === pid)) {
      items.push({ project_id: pid, cost_to_date: 0, forecast_final_cost: 0, cost_labour: 0, cost_subbies: 0, cost_materials: 0, last_pulled_at: null, mapped: true, has_overrides: overrideProjects.has(pid), sales: salesByProject.get(pid) ?? [] })
    }
  }

  return NextResponse.json({ items, configured: true })
}
