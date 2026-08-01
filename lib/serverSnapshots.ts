// Server-side fade-snapshot capture (fg_project_snapshots) - the cron-safe replacement for
// the browser-dependent path. The original /api/snapshots/now relied on the BROWSER to compute
// the Live Jobs rows because progress claims were localStorage-only; claims, estimates and
// projects all sync to Supabase now, so the server assembles the same rows itself and the GP
// fade history no longer depends on someone opening the dashboard. This path also freezes the
// per-account cost map, which the browser path always wrote as {}.
//
// Lite column mappers follow the lib/projectMetrics pattern: only the fields the live-job
// maths actually reads, cast to the app types. computeLiveJobRow / getTargetMarginPct read:
// project id/entity/name/contractValue/targetMarginPct/baseline; estimate status/
// parentEstimateId/lineItems/categoryKind/projectMarkups/roundingMode/variationAmount.

import { supabaseAdmin } from './supabaseAdmin'
import { computeLiveJobRow } from './liveJobs'
import { writeSnapshots, melbourneISODate, type SnapshotResult, type SnapshotInput } from './snapshots'
import { isLiveProject } from './stageConfig'
import type { Estimate, ProgressClaim, Project } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

function liteProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    entity: row.entity as Project['entity'],
    name: (row.name as string) || '',
    status: row.status as Project['status'],
    stage: (row.stage as Project['stage']) || undefined,
    contractValue: Number(row.contract_value) || 0,
    targetMarginPct: row.target_margin_pct != null ? Number(row.target_margin_pct) : undefined,
    baseline: (row.baseline as Project['baseline']) || undefined,
  } as Project
}

function liteEstimate(row: Record<string, unknown>): Estimate {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    status: row.status as Estimate['status'],
    parentEstimateId: (row.parent_estimate_id as string | null) || undefined,
    lineItems: (row.line_items as Estimate['lineItems']) || [],
    categoryKind: (row.category_kind as Estimate['categoryKind']) || undefined,
    projectMarkups: (row.project_markups as Estimate['projectMarkups']) || undefined,
    roundingMode: (row.rounding_mode as Estimate['roundingMode']) || undefined,
    variationAmount: row.variation_amount != null ? Number(row.variation_amount) : undefined,
    defaultMarkupFormation: Number(row.default_markup_formation) || 0,
    defaultMarkupSubcontractor: Number(row.default_markup_subcontractor) || 0,
  } as Estimate
}

export type ServerSnapshotResult = SnapshotResult & { snapshot_date: string; projects: number }

/**
 * Snapshot every live project's Live Jobs row for today (Melbourne). Append-only: the
 * (project_id, snapshot_date) unique constraint dedups, so calling twice a day is safe -
 * the second run reports skipped_duplicate.
 */
export async function captureServerSnapshots(now = new Date()): Promise<ServerSnapshotResult> {
  const snapshotDate = melbourneISODate(now)
  if (!supabaseAdmin) {
    return { ok: false, snapshotted: 0, skipped_duplicate: 0, error: 'supabase_admin_not_configured', snapshot_date: snapshotDate, projects: 0 }
  }

  const [projRes, estRes, claimRes, costRes, fcRes, mapRes] = await Promise.all([
    supabaseAdmin.from('fg_projects').select('id, entity, name, status, stage, contract_value, target_margin_pct, baseline'),
    supabaseAdmin.from('fg_estimates').select('id, project_id, status, parent_estimate_id, line_items, category_kind, project_markups, rounding_mode, variation_amount, default_markup_formation, default_markup_subcontractor'),
    supabaseAdmin.from('fg_progress_claims').select('data'),
    supabaseAdmin.from('fg_xero_project_costs').select('project_id, account_code, amount_ex_gst'),
    supabaseAdmin.from('fg_project_cost_forecast').select('project_id, account_code, forecast_final'),
    supabaseAdmin.from('fg_project_xero_mapping').select('project_id'),
  ])
  const firstError = projRes.error || estRes.error || claimRes.error || costRes.error || fcRes.error || mapRes.error
  if (firstError) {
    return { ok: false, snapshotted: 0, skipped_duplicate: 0, error: firstError.message, snapshot_date: snapshotDate, projects: 0 }
  }

  const projects = (projRes.data ?? []).map(liteProject).filter(isLiveProject)
  const estimates = (estRes.data ?? []).map(liteEstimate)
  const claims = (claimRes.data ?? []).map(r => r.data as ProgressClaim)
  const mapped = new Set((mapRes.data ?? []).map(r => r.project_id as string))

  // Per-project per-account actuals + forecast overrides - the same fold as /api/xero/live-jobs,
  // so the snapshot freezes exactly what the dashboard shows.
  const accountsByProject = new Map<string, Map<string, { actual: number; forecast: number | null }>>()
  for (const c of costRes.data ?? []) {
    const pid = c.project_id as string
    if (!accountsByProject.has(pid)) accountsByProject.set(pid, new Map())
    accountsByProject.get(pid)!.set(c.account_code as string, { actual: Number(c.amount_ex_gst) || 0, forecast: null })
  }
  for (const f of fcRes.data ?? []) {
    const acc = accountsByProject.get(f.project_id as string)?.get(f.account_code as string)
    if (acc) acc.forecast = f.forecast_final != null ? Number(f.forecast_final) : null
  }

  const inputs: SnapshotInput[] = projects.map(project => {
    const acceptedEstimates = estimates.filter(e => e.projectId === project.id && e.status === 'accepted')
    const progressClaims = claims.filter(c => c.projectId === project.id)
    const accounts = accountsByProject.get(project.id)
    const isMapped = mapped.has(project.id)
    // Mapped with no spend yet reads as 0 (live data, nothing billed); unmapped reads as null
    // (no live data) - mirrors the live-jobs API contract that computeLiveJobRow expects.
    const costToDate = isMapped
      ? round2(Array.from(accounts?.values() ?? []).reduce((s, a) => s + a.actual, 0))
      : null
    const forecastFinalCost = isMapped
      ? round2(Array.from(accounts?.values() ?? []).reduce((s, a) => s + (a.forecast ?? a.actual), 0))
      : null
    const costByAccount: Record<string, number> = {}
    if (accounts) accounts.forEach((a, code) => { costByAccount[code] = round2(a.actual) })
    return {
      row: computeLiveJobRow({ project, acceptedEstimates, progressClaims, costToDate, forecastFinalCost }),
      costByAccount,
    }
  })

  const result = await writeSnapshots(inputs, snapshotDate)
  return { ...result, snapshot_date: snapshotDate, projects: projects.length }
}
