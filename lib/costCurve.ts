// Cumulative budget-vs-actual cost curve — pure, testable.
//
// Combines the Gantt weekly cost budget (WeeklyRevenue.scheduledCost) with the time-phased Xero
// actuals (fg_xero_cost_periods: weekly supply + monthly labour) into a weekly cumulative series
// you can plot as an S-curve. "Cumulative-to-date" is the honest framing: a late supplier invoice
// still lands, just a week or two later, and the cumulative line catches up.

export interface CostPeriod {
  period_end: string            // YYYY-MM-DD (Friday for supply, month-end for labour)
  amount_ex_gst: number
  source: 'supply' | 'labour'
  grain: 'week' | 'month'
}

export interface BudgetWeek {
  weekEnding: string            // YYYY-MM-DD Friday
  scheduledCost: number
}

export interface CostCurvePoint {
  weekEnding: string
  cumBudget: number
  cumActual: number
  cumSupply: number
  cumLabour: number
}

export interface CostCurve {
  points: CostCurvePoint[]
  totalBudget: number           // full budgeted cost (all weeks)
  totalActual: number           // actual booked to the end of the series
}

function round2(n: number): number { return Math.round(n * 100) / 100 }

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** The Friday on or before a date (axis start — guarantees the first point is ≤ earliest data). */
function fridayOnOrBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() - ((d.getDay() - 5 + 7) % 7))
  return ymd(d)
}

/** The Friday on or after a date (axis end — guarantees every actual, incl. a Saturday month-end,
 * is counted by the final point). */
function fridayOnOrAfter(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7))
  return ymd(d)
}

/**
 * Build the cumulative cost curve over a weekly (Friday) axis spanning the earliest to latest
 * relevant date across budget + actuals. At each Friday F: cumulative budget = Σ scheduledCost
 * with weekEnding ≤ F; cumulative actual = Σ supply (weekly) + Σ labour (monthly) with period_end
 * ≤ F. Pure — no "today"; the caller marks today against the returned points.
 */
export function buildCostCurve(budget: BudgetWeek[], actual: CostPeriod[]): CostCurve {
  const cleanBudget = budget.filter(b => b.weekEnding && (b.scheduledCost || 0) !== 0)
  const cleanActual = actual.filter(a => a.period_end && (a.amount_ex_gst || 0) !== 0)

  const totalBudget = round2(cleanBudget.reduce((s, b) => s + b.scheduledCost, 0))
  const totalActual = round2(cleanActual.reduce((s, a) => s + a.amount_ex_gst, 0))

  const dates = [...cleanBudget.map(b => b.weekEnding), ...cleanActual.map(a => a.period_end)].sort()
  if (dates.length === 0) return { points: [], totalBudget: 0, totalActual: 0 }

  const endFri = fridayOnOrAfter(dates[dates.length - 1])
  const cursor = new Date(`${fridayOnOrBefore(dates[0])}T00:00:00`)
  const points: CostCurvePoint[] = []
  let guard = 0
  while (ymd(cursor) <= endFri && guard++ < 520) {   // 520-week cap = ~10yr backstop
    const F = ymd(cursor)
    const cumBudget = cleanBudget.reduce((s, b) => (b.weekEnding <= F ? s + b.scheduledCost : s), 0)
    const cumSupply = cleanActual.reduce((s, a) => (a.source === 'supply' && a.period_end <= F ? s + a.amount_ex_gst : s), 0)
    const cumLabour = cleanActual.reduce((s, a) => (a.source === 'labour' && a.period_end <= F ? s + a.amount_ex_gst : s), 0)
    points.push({
      weekEnding: F,
      cumBudget: round2(cumBudget),
      cumSupply: round2(cumSupply),
      cumLabour: round2(cumLabour),
      cumActual: round2(cumSupply + cumLabour),
    })
    cursor.setDate(cursor.getDate() + 7)
  }
  return { points, totalBudget, totalActual }
}
