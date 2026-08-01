// Job closeout backstop - server-only, runs from the cron extras task. Any project sitting
// at status complete/invoiced without a closeout row gets its final result frozen into
// fg_project_closeouts: final revenue/cost/GP vs quoted margin, plus the per-account cost
// breakdown. Append-once (project_id PK, insert ignored on conflict) - a closeout is a
// historical record, never recomputed, so later Xero drift can't rewrite history. The first
// run backfills every already-completed job automatically.

import { supabaseAdmin } from './supabaseAdmin'
import { computeLiveJobRow, ganttCostTotal } from './liveJobs'
import { melbourneISODate } from './snapshots'
import type { Estimate, GanttEntry, ProgressClaim, Project } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface CloseoutResult { ok: boolean; checked: number; captured: number; error?: string }

export async function runCloseoutBackstop(): Promise<CloseoutResult> {
  if (!supabaseAdmin) return { ok: false, checked: 0, captured: 0, error: 'supabase_admin_not_configured' }

  const [projRes, doneRes] = await Promise.all([
    supabaseAdmin.from('fg_projects')
      .select('id, entity, name, status, stage, contract_value, target_margin_pct, baseline, updated_at')
      .in('status', ['complete', 'invoiced']),
    supabaseAdmin.from('fg_project_closeouts').select('project_id'),
  ])
  if (projRes.error) return { ok: false, checked: 0, captured: 0, error: projRes.error.message }
  const already = new Set((doneRes.data ?? []).map(r => r.project_id as string))
  const toClose = (projRes.data ?? []).filter(r => !already.has(r.id as string))
  if (toClose.length === 0) return { ok: true, checked: (projRes.data ?? []).length, captured: 0 }

  const ids = toClose.map(r => r.id as string)
  const [estRes, claimRes, costRes, fcRes, mapRes, ganttRes] = await Promise.all([
    supabaseAdmin.from('fg_estimates')
      .select('id, project_id, status, parent_estimate_id, line_items, category_kind, project_markups, rounding_mode, variation_amount, default_markup_formation, default_markup_subcontractor')
      .in('project_id', ids),
    supabaseAdmin.from('fg_progress_claims').select('data'),
    supabaseAdmin.from('fg_xero_project_costs').select('project_id, account_code, amount_ex_gst').in('project_id', ids),
    supabaseAdmin.from('fg_project_cost_forecast').select('project_id, account_code, forecast_final').in('project_id', ids),
    supabaseAdmin.from('fg_project_xero_mapping').select('project_id').in('project_id', ids),
    supabaseAdmin.from('fg_gantt').select('id, project_id, category, crew_type, budgeted_revenue, budgeted_cost, segments, subtasks').in('project_id', ids),
  ])

  const estimates = (estRes.data ?? []).map(r => ({
    id: r.id as string,
    projectId: r.project_id as string,
    status: r.status as Estimate['status'],
    parentEstimateId: (r.parent_estimate_id as string | null) || undefined,
    lineItems: (r.line_items as Estimate['lineItems']) || [],
    categoryKind: (r.category_kind as Estimate['categoryKind']) || undefined,
    projectMarkups: (r.project_markups as Estimate['projectMarkups']) || undefined,
    roundingMode: (r.rounding_mode as Estimate['roundingMode']) || undefined,
    variationAmount: r.variation_amount != null ? Number(r.variation_amount) : undefined,
  } as Estimate))
  const claims = (claimRes.data ?? []).map(r => r.data as ProgressClaim)
  const mapped = new Set((mapRes.data ?? []).map(r => r.project_id as string))
  const overrideProjects = new Set((fcRes.data ?? []).filter(f => f.forecast_final != null).map(f => f.project_id as string))
  const overridesByKey = new Map((fcRes.data ?? []).map(f => [`${f.project_id}|${f.account_code}`, f.forecast_final != null ? Number(f.forecast_final) : null]))

  const ganttByProject = new Map<string, GanttEntry[]>()
  for (const r of ganttRes.data ?? []) {
    const e = {
      id: r.id as string, projectId: r.project_id as string, estimateId: '',
      category: r.category as string, crewType: (r.crew_type as GanttEntry['crewType']) || 'Formation',
      budgetedRevenue: Number(r.budgeted_revenue) || 0, budgetedCost: Number(r.budgeted_cost) || 0,
      segments: (r.segments as GanttEntry['segments']) || [], subtasks: (r.subtasks as GanttEntry['subtasks']) || [],
    } as GanttEntry
    if (!ganttByProject.has(e.projectId)) ganttByProject.set(e.projectId, [])
    ganttByProject.get(e.projectId)!.push(e)
  }

  const costByProject = new Map<string, Map<string, number>>()
  for (const c of costRes.data ?? []) {
    const pid = c.project_id as string
    if (!costByProject.has(pid)) costByProject.set(pid, new Map())
    costByProject.get(pid)!.set(c.account_code as string, Number(c.amount_ex_gst) || 0)
  }

  let captured = 0
  for (const raw of toClose) {
    const project = {
      id: raw.id as string,
      entity: raw.entity as Project['entity'],
      name: (raw.name as string) || '',
      status: raw.status as Project['status'],
      stage: (raw.stage as Project['stage']) || undefined,
      contractValue: Number(raw.contract_value) || 0,
      targetMarginPct: raw.target_margin_pct != null ? Number(raw.target_margin_pct) : undefined,
      baseline: (raw.baseline as Project['baseline']) || undefined,
    } as Project
    const accounts = costByProject.get(project.id)
    const costToDate = mapped.has(project.id)
      ? round2(Array.from(accounts?.values() ?? []).reduce((s, v) => s + v, 0))
      : null
    // At closeout the forecast question collapses: final cost = overrides where set, else spend.
    let forecastFinalCost: number | null = null
    if (costToDate !== null && accounts) {
      let sum = 0
      accounts.forEach((actual, code) => {
        const ov = overridesByKey.get(`${project.id}|${code}`)
        sum += ov != null ? ov : actual
      })
      forecastFinalCost = round2(sum)
    }
    const gantt = ganttByProject.get(project.id) ?? []
    const row = computeLiveJobRow({
      project,
      acceptedEstimates: estimates.filter(e => e.projectId === project.id && e.status === 'accepted'),
      progressClaims: claims.filter(c => c.projectId === project.id),
      costToDate,
      // A finished job's cost IS its spend - no plan floor needed when live data exists.
      forecastFinalCost,
      ganttCost: costToDate !== null ? null : (gantt.length ? ganttCostTotal(gantt) : null),
      hasForecastOverrides: costToDate !== null ? true : overrideProjects.has(project.id),
    })
    const costByAccount: Record<string, number> = {}
    if (accounts) accounts.forEach((v, code) => { costByAccount[code] = round2(v) })

    const closedAt = raw.updated_at ? String(raw.updated_at).slice(0, 10) : melbourneISODate()
    const { error } = await supabaseAdmin.from('fg_project_closeouts').insert({
      project_id: project.id,
      entity: project.entity,
      name: project.name,
      closed_at: closedAt,
      final_revenue: row.forecastRevenue,
      invoiced_total: row.invoicedToDate,
      final_cost: row.forecastFinalCost,
      final_gp_dollars: row.forecastGpDollars,
      final_gp_pct: row.forecastGpPct,
      quoted_margin_pct: row.quotedMarginPct,
      target_margin_pct: row.targetMarginPct,
      cost_basis: costToDate !== null ? 'xero' : 'estimate',
      cost_by_account: costByAccount,
    })
    if (error && error.code !== '23505') {
      return { ok: false, checked: (projRes.data ?? []).length, captured, error: error.message }
    }
    if (!error) captured++
  }
  return { ok: true, checked: (projRes.data ?? []).length, captured }
}
