// Company budget / targets - pure shared types + maths (client-safe, no server imports).
// One row per Australian financial year (July-June), stored in fg_company_budget and served
// by /api/company/budget. This replaces the hardcoded "40% target" literals: pages read the
// stored GP target (falling back to 40 when nothing is saved yet).

export interface CompanyBudget {
  /** Year the FY starts in: 2026 = FY 2026-27 (Jul 2026 - Jun 2027). */
  fyStartYear: number
  revenueTargetFormation: number
  revenueTargetLume: number
  revenueTargetDesign: number
  gpTargetPct: number
  overheadBudgetMonthly: number
  updatedAt?: string
}

export const DEFAULT_GP_TARGET = 40

export function emptyBudget(fyStartYear: number): CompanyBudget {
  return {
    fyStartYear,
    revenueTargetFormation: 0,
    revenueTargetLume: 0,
    revenueTargetDesign: 0,
    gpTargetPct: DEFAULT_GP_TARGET,
    overheadBudgetMonthly: 0,
  }
}

/** The FY a date belongs to, by start year (Jul-Jun). */
export function fyStartYearOf(date: Date): number {
  return date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1
}

/** Label matching lib/utils.getFinancialYear: "FY 2026-27". */
export function fyLabelOf(fyStartYear: number): string {
  return `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`
}

/** Inclusive ISO date range of the FY. */
export function fyRangeIso(fyStartYear: number): { fromIso: string; toIso: string } {
  return { fromIso: `${fyStartYear}-07-01`, toIso: `${fyStartYear + 1}-06-30` }
}

/** Fraction of the FY elapsed at `todayIso`, clamped 0..1. */
export function fyElapsedPct(fyStartYear: number, todayIso: string): number {
  const { fromIso, toIso } = fyRangeIso(fyStartYear)
  const start = new Date(`${fromIso}T00:00:00`).getTime()
  const end = new Date(`${toIso}T00:00:00`).getTime() + 24 * 60 * 60 * 1000
  const today = new Date(`${todayIso}T00:00:00`).getTime()
  if (today <= start) return 0
  if (today >= end) return 1
  return (today - start) / (end - start)
}

export interface BudgetProgress {
  target: number
  invoicedToDate: number
  /** Planned revenue still scheduled from today to FY end. */
  plannedRemaining: number
  /** invoiced + still-scheduled: where the year lands if the plan holds. */
  projection: number
  /** projection - target */
  variance: number
  /** projection / target, 0-100+. Null when no target is set. */
  pctOfTarget: number | null
}

export function computeBudgetProgress(
  target: number,
  invoicedToDate: number,
  plannedRemaining: number,
): BudgetProgress {
  const projection = Math.round((invoicedToDate + plannedRemaining) * 100) / 100
  return {
    target,
    invoicedToDate,
    plannedRemaining,
    projection,
    variance: Math.round((projection - target) * 100) / 100,
    pctOfTarget: target > 0 ? Math.round((projection / target) * 1000) / 10 : null,
  }
}
