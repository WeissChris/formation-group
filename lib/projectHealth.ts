import type { Project, Estimate, GanttEntry, WeeklyActual } from '@/types'
import { entrySegments } from './ganttForecast'
import { getEstimateTotals } from './estimateCalculations'

export type HealthStatus = 'green' | 'amber' | 'red'

export interface HealthFlag {
  reason: string
  status: HealthStatus
}

export interface ProjectHealth {
  status: HealthStatus       // worst of all flags
  flags: HealthFlag[]
  // Variance values
  gpVariance: number | null          // forecast GP% - baseline GP%
  forecastGP: number | null
  baselineGP: number | null
  costVariancePct: number | null     // (forecast cost - baseline cost) / baseline cost * 100
  daysSlippage: number | null        // forecast completion - baseline completion in days
  revenueVariancePct: number | null  // (forecast revenue - baseline revenue) / baseline revenue * 100
}

const GP_TARGET = 40              // Legacy default — superseded by per-project targetMarginPct
const COST_AMBER_THRESHOLD = 5    // 5% cost increase → amber
const COST_RED_THRESHOLD = 10     // 10% cost increase → red
const DAYS_AMBER_THRESHOLD = 7    // 1 week slip → amber
const DAYS_RED_THRESHOLD = 21     // 3 week slip → red

/**
/**
 * Project GP goal (%) by subcontractor share of REVENUE — the banded rule (subbie-heavy jobs run lower):
 *   <20% -> 42, 20-25 -> 41, 25-30 -> 40, 30-35 -> 39, 35-40 -> 38, then -1 per further 5%, floored at 30.
 * Bands are lower-bound inclusive (exactly 35% sits in the 35-40 band -> 38).
 */
export function projectGpGoalPct(subRevenueShare: number): number {
  if (subRevenueShare < 0.20) return 42
  // +1e-9 so float error (0.25-0.20 = 0.04999...) doesn't drop a value sitting exactly on a band edge.
  const band = Math.floor((subRevenueShare - 0.20) / 0.05 + 1e-9)   // 0 for [20,25), 1 for [25,30), ...
  return Math.max(30, 41 - band)
}

/**
 * Resolve the project's target gross margin (as a percentage).
 *
 * Precedence:
 *   1. `project.targetMarginPct` — explicit manual override, always wins.
 *   2. The banded GP goal (projectGpGoalPct) keyed off the subcontractor share of revenue — subbie-heavy
 *      jobs run a lower margin, so a flat 40% wrongly flags them (e.g. ~35% subby revenue -> 38% goal).
 *   3. Legacy 40% when no override and no revenue mix is supplied.
 *
 * Pass `mix` (Formation/Subcontractor revenue split, e.g. from getEstimateTotals) to get the band.
 */
export function getTargetMarginPct(project: Project, mix?: { formationRevenue: number; subRevenue: number }): number {
  if (project.targetMarginPct != null) return project.targetMarginPct
  const totalRev = mix ? mix.formationRevenue + mix.subRevenue : 0
  if (totalRev > 0) return projectGpGoalPct(mix!.subRevenue / totalRev)
  return 40
}

/**
 * Resolve the project's forecast completion date.
 * Precedence:
 *   1. `project.forecastCompletion` — explicit manual override
 *   2. latest Gantt segment end across all entries
 *   3. `project.plannedCompletion` — fallback to the original plan
 *
 * Passing `undefined` for ganttEntries simply skips step 2.
 */
export function getForecastCompletion(project: Project, ganttEntries?: GanttEntry[]): string | undefined {
  if (project.forecastCompletion) return project.forecastCompletion
  if (ganttEntries && ganttEntries.length > 0) {
    let latestMs = -Infinity
    for (const entry of ganttEntries) {
      for (const seg of entrySegments(entry)) {   // include split type-line bars, not just own segments
        if (!seg.endDate) continue
        const ms = new Date(seg.endDate).getTime()
        if (!isNaN(ms) && ms > latestMs) latestMs = ms
      }
    }
    if (latestMs !== -Infinity) return new Date(latestMs).toISOString().slice(0, 10)
  }
  return project.plannedCompletion
}

/**
 * Resolve the project's start date FROM the Gantt: the earliest scheduled start across all entries
 * (incl. split type-line bars), else fall back to the stored `project.startDate`. Mirror of
 * getForecastCompletion for the start edge, so the project summary reflects the chart automatically.
 */
export function getForecastStart(project: Project, ganttEntries?: GanttEntry[]): string | undefined {
  if (ganttEntries && ganttEntries.length > 0) {
    let earliestMs = Infinity
    for (const entry of ganttEntries) {
      for (const seg of entrySegments(entry)) {
        if (!seg.startDate) continue
        const ms = new Date(seg.startDate).getTime()
        if (!isNaN(ms) && ms < earliestMs) earliestMs = ms
      }
    }
    if (earliestMs !== Infinity) return new Date(earliestMs).toISOString().slice(0, 10)
  }
  return project.startDate
}

export function calcProjectHealth(
  project: Project,
  estimates: Estimate[],
  ganttEntries: GanttEntry[],
  actuals: WeeklyActual[],
): ProjectHealth {
  const flags: HealthFlag[] = []
  const baseline = project.baseline

  // ── Forecast GP% ──────────────────────────────────────────────────────────
  const acceptedEstimate = estimates.find(e => e.status === 'accepted' && !e.parentEstimateId)
  const forecastRevenue = project.contractValue || 0
  // Forecast cost = the FULL budget. Prefer the accepted estimate's line-item total: the Gantt is a
  // scheduling tool that's often only partially built, so summing its entries understates cost and
  // inflates GP (a Gantt with just Preliminaries once showed 98% GP on a 28% job). Fall back to the
  // Gantt sum only when there's no accepted estimate to budget from.
  const estimateCost = acceptedEstimate
    ? acceptedEstimate.lineItems.reduce((s, li) => s + li.total, 0)
    : 0
  const forecastCost = estimateCost > 0
    ? estimateCost
    : ganttEntries.reduce((s, g) => s + g.budgetedCost, 0)
  const forecastGP = forecastRevenue > 0 && forecastCost > 0
    ? ((forecastRevenue - forecastCost) / forecastRevenue) * 100
    : null
  const baselineGP = baseline?.gpPercent ?? null
  const gpVariance = forecastGP !== null && baselineGP !== null ? forecastGP - baselineGP : null

  // Target: the project's manual override if set, else blended from the accepted estimate's Formation/
  // Subcontractor cost split (subbie-heavy jobs run a lower target than a flat 40%).
  const mix = acceptedEstimate ? getEstimateTotals(acceptedEstimate) : undefined
  const targetMarginPct = getTargetMarginPct(project, mix)
  if (forecastGP !== null && forecastGP < targetMarginPct) {
    flags.push({
      reason: `Review Required – Forecast GP below target (${forecastGP.toFixed(1)}% vs ${targetMarginPct}% target)`,
      // Red when more than 10ppts below target; amber otherwise
      status: forecastGP < targetMarginPct - 10 ? 'red' : 'amber',
    })
  }

  // ── Cost variance ─────────────────────────────────────────────────────────
  const baselineCost = baseline?.costEstimate ?? null
  const costVariancePct = baselineCost && baselineCost > 0 && forecastCost > 0
    ? ((forecastCost - baselineCost) / baselineCost) * 100
    : null

  if (costVariancePct !== null && costVariancePct > COST_AMBER_THRESHOLD) {
    flags.push({
      reason: `Review Required – Cost increasing (+${costVariancePct.toFixed(1)}% vs baseline)`,
      status: costVariancePct >= COST_RED_THRESHOLD ? 'red' : 'amber',
    })
  }

  // ── Programme slippage ────────────────────────────────────────────────────
  const baselineCompletion = baseline?.plannedCompletion
  const forecastCompletion = getForecastCompletion(project, ganttEntries)
  let daysSlippage: number | null = null

  if (baselineCompletion && forecastCompletion) {
    const bMs = new Date(baselineCompletion).getTime()
    const fMs = new Date(forecastCompletion).getTime()
    daysSlippage = Math.round((fMs - bMs) / (1000 * 60 * 60 * 24))
    if (daysSlippage > DAYS_AMBER_THRESHOLD) {
      flags.push({
        reason: `Review Required – Completion delayed (+${daysSlippage}d behind plan)`,
        status: daysSlippage >= DAYS_RED_THRESHOLD ? 'red' : 'amber',
      })
    }
  }

  // ── Revenue variance ─────────────────────────────────────────────────────
  const baselineRevenue = baseline?.contractValue ?? null
  const revenueVariancePct = baselineRevenue && baselineRevenue > 0 && forecastRevenue > 0
    ? ((forecastRevenue - baselineRevenue) / baselineRevenue) * 100
    : null

  if (revenueVariancePct !== null && revenueVariancePct < -5) {
    flags.push({
      reason: `Review Required – Revenue behind plan (${revenueVariancePct.toFixed(1)}%)`,
      status: revenueVariancePct < -10 ? 'red' : 'amber',
    })
  }

  // ── Roll up status ────────────────────────────────────────────────────────
  const status: HealthStatus = flags.some(f => f.status === 'red')
    ? 'red'
    : flags.some(f => f.status === 'amber')
      ? 'amber'
      : 'green'

  return {
    status,
    flags,
    gpVariance,
    forecastGP,
    baselineGP,
    costVariancePct,
    daysSlippage,
    revenueVariancePct,
  }
}

// Programme status only — based on planned vs expected completion.
// Pass `ganttEntries` to derive the forecast from the latest Gantt segment when no explicit
// override is set on the project. Without entries, falls back to plannedCompletion (same as before).
export function scheduleStatus(project: Project, ganttEntries?: GanttEntry[]): { status: HealthStatus; daysSlippage: number | null } {
  const planned = project.baseline?.plannedCompletion
  const expected = getForecastCompletion(project, ganttEntries)
  if (!planned || !expected) return { status: 'green', daysSlippage: null }
  const days = Math.round((new Date(expected).getTime() - new Date(planned).getTime()) / (1000 * 60 * 60 * 24))
  const status: HealthStatus = days <= 0 ? 'green' : days <= 7 ? 'amber' : 'red'
  return { status, daysSlippage: days }
}

export function healthColour(status: HealthStatus): string {
  return status === 'green' ? 'text-green-600'
    : status === 'amber' ? 'text-amber-500'
    : 'text-red-500'
}

export function healthBg(status: HealthStatus): string {
  return status === 'green' ? 'bg-green-500'
    : status === 'amber' ? 'bg-amber-400'
    : 'bg-red-500'
}

export function healthBorder(status: HealthStatus): string {
  return status === 'green' ? 'border-green-400/40'
    : status === 'amber' ? 'border-amber-400/40'
    : 'border-red-400/40'
}
