// Live Jobs row computation — pure functions, testable.
//
// Combines:
//   - localStorage: Project, accepted Estimates, ProgressClaims, baseline
//   - server (Xero): cost_to_date, forecast_final_cost (from /api/xero/live-jobs)
//
// Produces one LiveJobRow per active project, matching the columns of
// Andrew's `Live_Jobs_Tracker__Andrew_.xlsx` Summary sheet.

import type { Project, Estimate, ProgressClaim } from '@/types'
import { getEstimateContract, variationContractValue } from './estimateCalculations'
import { getTargetMarginPct } from './projectHealth'

export interface LiveJobRow {
  projectId: string
  projectName: string
  entity: Project['entity']
  /** Revised contract value (original + accepted variations) OR raw contractValue */
  forecastRevenue: number
  invoicedToDate: number
  pctBilled: number
  costToDate: number
  forecastFinalCost: number
  forecastGpDollars: number
  /** Live forecast GP%, 0-100 scale */
  forecastGpPct: number
  /** Original quoted margin from baseline (or the project's target if no baseline). 0-100 scale */
  quotedMarginPct: number
  /** Per-project target. 0-100 scale */
  targetMarginPct: number
  /** Live GP% minus quoted margin. Negative = fading. */
  fadePpts: number
  status: 'on_target' | 'watch' | 'below_target'
  /** True when the project has a Xero tracking mapping AND has had a sync */
  hasLiveCostData: boolean
}

interface LiveJobInputs {
  project: Project
  acceptedEstimates: Estimate[]      // both base and variation, where status === 'accepted'
  progressClaims: ProgressClaim[]
  /** Xero-derived cost. NULL when the project hasn't been mapped or hasn't been synced yet. */
  costToDate: number | null
  /** Server-computed forecast (sum of override-or-actual per account). NULL falls back to costToDate. */
  forecastFinalCost: number | null
}

/**
 * Compute the Live Job row for a single project. Pure function — all inputs in, all outputs out.
 *
 * Status thresholds are per-project (anchored to targetMarginPct, not a global 40%):
 *   on_target    forecastGP% >= targetMarginPct - 2   (within 2ppts of target = green)
 *   watch        forecastGP% >= targetMarginPct - 10  (within 10ppts = amber)
 *   below_target otherwise                            (red)
 *
 * Matches Andrew's spreadsheet rule scaled to per-project targets: a 33% subbie-heavy job
 * sitting at 31% is "on target", not "below" (which would be the case with a global 40%).
 */
export function computeLiveJobRow(inputs: LiveJobInputs): LiveJobRow {
  const { project, acceptedEstimates, progressClaims, costToDate, forecastFinalCost } = inputs

  // Revenue: base contract + accepted variations
  const baseEstimates = acceptedEstimates.filter(e => !e.parentEstimateId)
  const variationEstimates = acceptedEstimates.filter(e => !!e.parentEstimateId)
  const baseContract = baseEstimates.reduce((s, e) => s + getEstimateContract(e).exGst, 0)
  const variationsTotal = variationEstimates.reduce((s, e) => s + variationContractValue(e), 0)
  const revisedContract = baseContract + variationsTotal
  const forecastRevenue = revisedContract > 0 ? revisedContract : (project.contractValue || 0)

  // Invoiced — sent + paid progress claims
  const invoicedToDate = progressClaims
    .filter(c => c.status === 'sent' || c.status === 'paid')
    .reduce((s, c) => s + c.subtotalEx, 0)

  const pctBilled = forecastRevenue > 0 ? (invoicedToDate / forecastRevenue) * 100 : 0

  // Cost — Xero-derived. NULL → 0 with hasLiveCostData=false signal.
  const cost = costToDate ?? 0
  // Forecast final cost: prefer the Xero forecast, then Xero cost-to-date, then the accepted-estimate
  // budget. The old `?? cost` bottomed out at 0 for any job with no Xero feed yet, which read as a
  // 100% GP. The estimate budget keeps the forecast margin sensible until live cost data arrives.
  const estimateCost = acceptedEstimates.reduce(
    (s, e) => s + (e.lineItems || []).reduce((ls, li) => ls + (li.total || 0), 0), 0)
  const forecastCost = forecastFinalCost ?? (costToDate ?? estimateCost)
  const hasLiveCostData = costToDate !== null

  // GP
  const forecastGpDollars = forecastRevenue - forecastCost
  const forecastGpPct = forecastRevenue > 0 ? (forecastGpDollars / forecastRevenue) * 100 : 0

  // Target + fade. Blend the target by the Formation/Subcontractor cost split so subbie-heavy jobs
  // aren't held to a flat 40% (mirrors the project-health card).
  const formationCost = acceptedEstimates.reduce((s, e) => s + (e.lineItems || []).filter(li => li.crewType === 'Formation').reduce((ls, li) => ls + (li.total || 0), 0), 0)
  const subCost = acceptedEstimates.reduce((s, e) => s + (e.lineItems || []).filter(li => li.crewType === 'Subcontractor').reduce((ls, li) => ls + (li.total || 0), 0), 0)
  const targetMarginPct = getTargetMarginPct(project, { formationCost, subCost })
  const quotedMarginPct = project.baseline?.gpPercent ?? targetMarginPct
  const fadePpts = forecastGpPct - quotedMarginPct

  // Status — per-project anchored
  let status: LiveJobRow['status']
  if (!hasLiveCostData) {
    // No cost data yet — neutral. Show as "watch" so it appears in the review section.
    status = 'watch'
  } else if (forecastGpPct >= targetMarginPct - 2) {
    status = 'on_target'
  } else if (forecastGpPct >= targetMarginPct - 10) {
    status = 'watch'
  } else {
    status = 'below_target'
  }

  return {
    projectId: project.id,
    projectName: project.name,
    entity: project.entity,
    forecastRevenue: round2(forecastRevenue),
    invoicedToDate: round2(invoicedToDate),
    pctBilled: round1(pctBilled),
    costToDate: round2(cost),
    forecastFinalCost: round2(forecastCost),
    forecastGpDollars: round2(forecastGpDollars),
    forecastGpPct: round1(forecastGpPct),
    quotedMarginPct: round1(quotedMarginPct),
    targetMarginPct: round1(targetMarginPct),
    fadePpts: round1(fadePpts),
    status,
    hasLiveCostData,
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }

/**
 * Portfolio totals across a list of LiveJobRows. Used for the dashboard's
 * "5 jobs · $2.1M revenue · 30% GP · 2 below target" header strip.
 */
export interface PortfolioTotals {
  jobCount: number
  forecastRevenue: number
  invoicedToDate: number
  costToDate: number
  forecastFinalCost: number
  forecastGpDollars: number
  forecastGpPct: number
  belowTargetCount: number
  watchCount: number
  onTargetCount: number
}

export function computePortfolioTotals(rows: LiveJobRow[]): PortfolioTotals {
  const forecastRevenue = rows.reduce((s, r) => s + r.forecastRevenue, 0)
  const invoicedToDate = rows.reduce((s, r) => s + r.invoicedToDate, 0)
  const costToDate = rows.reduce((s, r) => s + r.costToDate, 0)
  const forecastFinalCost = rows.reduce((s, r) => s + r.forecastFinalCost, 0)
  const forecastGpDollars = forecastRevenue - forecastFinalCost
  const forecastGpPct = forecastRevenue > 0 ? (forecastGpDollars / forecastRevenue) * 100 : 0

  return {
    jobCount: rows.length,
    forecastRevenue: round2(forecastRevenue),
    invoicedToDate: round2(invoicedToDate),
    costToDate: round2(costToDate),
    forecastFinalCost: round2(forecastFinalCost),
    forecastGpDollars: round2(forecastGpDollars),
    forecastGpPct: round1(forecastGpPct),
    belowTargetCount: rows.filter(r => r.status === 'below_target').length,
    watchCount: rows.filter(r => r.status === 'watch').length,
    onTargetCount: rows.filter(r => r.status === 'on_target').length,
  }
}
