// Labour reconciliation + pace — pure functions, server-and-client safe.
//
// Two concerns:
//
//   1. Reconciliation — Xero (truth) vs foreman entries (leading). Drift surfaces a chip
//      on the Costs tab; payroll-lag warns when foreman has logged recent weeks but Xero
//      hasn't caught up yet (normal — payroll posts on payroll cycles).
//
//   2. Pace — derived from estimate Labour line items + Xero labour-account spend:
//      allowance ($), spent, % spent, weekly burn rate, weeks left at current burn.
//
// Source-of-truth rules:
//   - Xero "Wages & Salaries - Production" + "Superannuation - Production" = labour cost
//     of sales for the project. Account names are matched case-insensitively; we don't
//     hardcode account codes because Chris's Xero CoA might renumber.
//   - Foreman labour = sum of WeeklyActuals.labourCost for the project (entered weekly via
//     the foreman page).
//   - Labour allowance = sum of estimate line items with type === 'Labour' (revenue field).
//     Cost-side of the allowance is line item .total; revenue-side is .revenue. We use the
//     cost figure here because we're comparing against actual cost.

import type { EstimateLineItem, WeeklyActual } from '@/types'

/** Match Chris's two production labour account names case-insensitively, ignoring extra whitespace. */
const LABOUR_ACCOUNT_NAMES = new Set([
  'wages & salaries - production',
  'superannuation - production',
])

export function isLabourAccount(accountName: string): boolean {
  return LABOUR_ACCOUNT_NAMES.has(accountName.trim().toLowerCase())
}

interface CostRollupRow {
  account_name: string
  amount_ex_gst: number
  last_bill_date?: string | null
}

export interface LabourReconciliation {
  /** Sum of Xero "Wages & Salaries - Production" + "Superannuation - Production" for this project */
  xeroLabour: number
  /** Sum of WeeklyActuals.labourCost — what the foreman has logged */
  foremanLabour: number
  /** Xero minus foreman. Positive = Xero says more than foreman logged (under-reported). */
  drift: number
  /** Drift as a percentage of foreman labour (0 if foreman is 0) */
  driftPct: number
  /**
   * True when foreman entries are recent but the latest Xero labour bill is well behind.
   * Suggests payroll hasn't posted for those weeks yet. Threshold: foreman has entries within
   * the last 14 days AND the most recent Xero labour bill is older than 14 days.
   */
  payrollLag: boolean
  /** Most recent foreman week-ending date (ISO YYYY-MM-DD or null) */
  latestForemanWeek: string | null
  /** Most recent Xero labour bill date (ISO YYYY-MM-DD or null) */
  latestXeroBill: string | null
}

/**
 * Compute labour reconciliation. Pure. All inputs in, all outputs out.
 *
 * `today` is parameterised so tests can pin the date — production callers pass new Date().
 */
export function reconcileLabour(
  costRows: CostRollupRow[],
  actuals: WeeklyActual[],
  today: Date = new Date(),
): LabourReconciliation {
  // Xero side — sum the labour accounts
  let xeroLabour = 0
  let latestXeroBill: string | null = null
  for (const r of costRows) {
    if (!isLabourAccount(r.account_name)) continue
    xeroLabour += r.amount_ex_gst
    if (r.last_bill_date && (!latestXeroBill || r.last_bill_date > latestXeroBill)) {
      latestXeroBill = r.last_bill_date
    }
  }

  // Foreman side — sum WeeklyActuals.labourCost
  let foremanLabour = 0
  let latestForemanWeek: string | null = null
  for (const a of actuals) {
    foremanLabour += a.labourCost || 0
    if (a.weekEnding && (!latestForemanWeek || a.weekEnding > latestForemanWeek)) {
      latestForemanWeek = a.weekEnding
    }
  }

  const drift = xeroLabour - foremanLabour
  const driftPct = foremanLabour > 0 ? (drift / foremanLabour) * 100 : 0

  // Payroll-lag detection: foreman entries are within 14 days AND Xero hasn't kept up
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000
  const todayMs = today.getTime()
  const foremanRecent = latestForemanWeek != null && (todayMs - new Date(latestForemanWeek).getTime()) <= FOURTEEN_DAYS_MS
  const xeroStale = latestXeroBill == null || (todayMs - new Date(latestXeroBill).getTime()) > FOURTEEN_DAYS_MS
  const payrollLag = foremanRecent && xeroStale

  return {
    xeroLabour: round2(xeroLabour),
    foremanLabour: round2(foremanLabour),
    drift: round2(drift),
    driftPct: round1(driftPct),
    payrollLag,
    latestForemanWeek,
    latestXeroBill,
  }
}

// ── Labour pace ──────────────────────────────────────────────────────────────

export interface LabourPace {
  /** Allowance from estimate Labour line items (cost side, sum of .total) */
  allowance: number
  /** What's been spent so far — uses Xero when present, else foreman */
  spent: number
  /** spent / allowance × 100 (or null if allowance == 0) */
  pctSpent: number | null
  /** Average weekly spend since project start (or null if start unknown / no weeks elapsed) */
  weeklyBurnRate: number | null
  /** Weeks left at current burn rate before exhausting allowance. null if burn is 0 or allowance exhausted */
  weeksLeftAtBurn: number | null
  /** Source we trusted for "spent" — drives a small label on the panel */
  spentSource: 'xero' | 'foreman' | 'none'
}

export function computeLabourPace(
  lineItems: EstimateLineItem[],
  xeroLabour: number | null,
  foremanLabour: number,
  projectStartDate: string | undefined,
  today: Date = new Date(),
): LabourPace {
  // Allowance — sum cost (not revenue) for Labour-type line items
  const allowance = lineItems
    .filter(li => li.type === 'Labour')
    .reduce((s, li) => s + (li.total || 0), 0)

  // Spent — Xero when available, else foreman, else nothing
  let spent = 0
  let spentSource: LabourPace['spentSource'] = 'none'
  if (xeroLabour != null && xeroLabour > 0) {
    spent = xeroLabour
    spentSource = 'xero'
  } else if (foremanLabour > 0) {
    spent = foremanLabour
    spentSource = 'foreman'
  }

  const pctSpent = allowance > 0 ? (spent / allowance) * 100 : null

  // Burn rate — averaged over weeks elapsed since startDate
  let weeklyBurnRate: number | null = null
  if (projectStartDate && spent > 0) {
    const start = new Date(projectStartDate).getTime()
    const weeksElapsed = (today.getTime() - start) / (7 * 24 * 60 * 60 * 1000)
    if (weeksElapsed > 0) weeklyBurnRate = spent / weeksElapsed
  }

  // Weeks left
  let weeksLeftAtBurn: number | null = null
  if (weeklyBurnRate != null && weeklyBurnRate > 0 && allowance > spent) {
    weeksLeftAtBurn = (allowance - spent) / weeklyBurnRate
  }

  return {
    allowance: round2(allowance),
    spent: round2(spent),
    pctSpent: pctSpent != null ? round1(pctSpent) : null,
    weeklyBurnRate: weeklyBurnRate != null ? round2(weeklyBurnRate) : null,
    weeksLeftAtBurn: weeksLeftAtBurn != null ? round1(weeksLeftAtBurn) : null,
    spentSource,
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }
function round2(n: number): number { return Math.round(n * 100) / 100 }
