import type { Project, Estimate, GanttEntry, WeeklyActual } from '@/types'

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

const GP_TARGET = 40
const COST_AMBER_THRESHOLD = 5    // 5% cost increase → amber
const COST_RED_THRESHOLD = 10     // 10% cost increase → red
const DAYS_AMBER_THRESHOLD = 7    // 1 week slip → amber
const DAYS_RED_THRESHOLD = 21     // 3 week slip → red

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
  const forecastCost = ganttEntries.length > 0
    ? ganttEntries.reduce((s, g) => s + g.budgetedCost, 0)
    : acceptedEstimate
      ? acceptedEstimate.lineItems.reduce((s, li) => s + li.total, 0)
      : 0
  const forecastGP = forecastRevenue > 0 && forecastCost > 0
    ? ((forecastRevenue - forecastCost) / forecastRevenue) * 100
    : null
  const baselineGP = baseline?.gpPercent ?? null
  const gpVariance = forecastGP !== null && baselineGP !== null ? forecastGP - baselineGP : null

  if (forecastGP !== null && forecastGP < GP_TARGET) {
    flags.push({
      reason: `Review Required – Forecast GP below target (${forecastGP.toFixed(1)}%)`,
      status: forecastGP < 30 ? 'red' : 'amber',
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
  const forecastCompletion = project.forecastCompletion || project.plannedCompletion
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

// Programme status only — based on planned vs expected completion
export function scheduleStatus(project: Project): { status: HealthStatus; daysSlippage: number | null } {
  const planned = project.baseline?.plannedCompletion
  const expected = project.forecastCompletion || project.plannedCompletion
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
