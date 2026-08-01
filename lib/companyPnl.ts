// Company-level P&L - pure shared maths (client-safe, no server imports).
//
// This is the ONE place the app is allowed to know about overheads and net profit, and it is
// company-scope only: the per-project cost feed (lib/xeroCostSync) keeps its hard GP-only
// guardrail - overheads NEVER land in fg_xero_project_costs or any project/site surface.
// Company months are stored in fg_company_pnl_months (service-role only) and surfaced solely
// through the director-gated /company page (see lib/directorGate).

export interface CompanyPnlMonth {
  /** First day of the month, YYYY-MM-01 */
  month: string
  entity: 'formation' | 'lume'
  revenue: number
  costOfSales: number
  grossProfit: number
  overheads: number
  netProfit: number
  /** Overhead account name -> amount for the month (director-page breakdown). */
  overheadsByAccount: Record<string, number>
  pulledAt?: string
}

// ── P&L report parsing ────────────────────────────────────────────────────────
// Minimal shapes of the Xero report JSON (same as lib/xeroCostSync reads).
interface PnlCell { Value?: string; Attributes?: Array<{ Id?: string; Value?: string }> }
interface PnlRow { RowType?: string; Title?: string; Cells?: PnlCell[]; Rows?: PnlRow[] }
export interface PnlReport { Reports?: Array<{ Rows?: PnlRow[] }> }

export interface AccountClassInfo {
  /** ASSET | EQUITY | EXPENSE | LIABILITY | REVENUE */
  cls: string
  /** DIRECTCOSTS | OVERHEADS | EXPENSE | WAGESEXPENSE | ... (the granular kind) */
  type: string
  name: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Bucket a single-period company P&L report into revenue / cost-of-sales / overheads by
 * ACCOUNT CLASS, not by section title - org-specific section names ("Less Operating
 * Expenses" vs "Expenses") can't break it. Only leaf rows carrying an account attribute are
 * read; section headers and summary rows (Gross Profit, Net Profit) are skipped, so nothing
 * is ever double-counted. Rows whose account can't be resolved are counted in the diag.
 *
 * Class REVENUE -> revenue. Class EXPENSE: type DIRECTCOSTS -> cost of sales (the same
 * definition as the GP-only project feed), everything else -> overheads.
 */
export function parseCompanyPnl(
  report: PnlReport,
  accountsById: Map<string, AccountClassInfo>,
): { revenue: number; costOfSales: number; overheads: number; overheadsByAccount: Record<string, number>; unmatchedRows: number } {
  const allRows: PnlRow[] = []
  const walk = (rows: PnlRow[] | undefined) => {
    for (const r of rows || []) {
      allRows.push(r)
      if (r.Rows) walk(r.Rows)
    }
  }
  walk(report.Reports?.[0]?.Rows)

  let revenue = 0
  let costOfSales = 0
  let overheads = 0
  let unmatchedRows = 0
  const overheadsByAccount: Record<string, number> = {}

  for (const row of allRows) {
    const cells = row.Cells
    if (row.RowType !== 'Row' || !cells || cells.length < 2) continue
    const accountId = cells[0].Attributes?.find(a => a.Id === 'account')?.Value
    if (!accountId) continue   // header/summary/no-account row - never a ledger line
    const raw = cells[1]?.Value
    const amount = parseFloat(String(raw ?? '').replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount === 0) continue

    const acc = accountsById.get(accountId)
    if (!acc) { unmatchedRows++; continue }
    if (acc.cls === 'REVENUE') {
      revenue += amount
    } else if (acc.cls === 'EXPENSE') {
      if (acc.type === 'DIRECTCOSTS') {
        costOfSales += amount
      } else {
        overheads += amount
        overheadsByAccount[acc.name] = round2((overheadsByAccount[acc.name] || 0) + amount)
      }
    }
    // Other classes (ASSET/LIABILITY/EQUITY) don't belong on a P&L - skip.
  }

  return {
    revenue: round2(revenue),
    costOfSales: round2(costOfSales),
    overheads: round2(overheads),
    overheadsByAccount,
    unmatchedRows,
  }
}

// ── Breakeven / trailing maths ────────────────────────────────────────────────

export interface CompanyBreakeven {
  /** Complete months used (most recent first). */
  monthsUsed: number
  /** Average monthly overheads across the recent window (default last 3 complete months). */
  avgMonthlyOverheads: number | null
  /** Trailing revenue-weighted GP% (0-100) across up to 12 complete months. */
  trailingGpPct: number | null
  /** Trailing NP% (0-100) across the same window. */
  trailingNpPct: number | null
  /** Overheads / GP%: the monthly revenue at which GP covers overheads. */
  breakevenRevenuePerMonth: number | null
}

/** First day of the month containing `iso`, as YYYY-MM-01. */
export function monthStartIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/**
 * Trailing GP% / NP% and the breakeven revenue implied by the recent overhead run-rate.
 * Only COMPLETE months count (the current month is partial and would drag every average
 * down); months with no activity at all (revenue AND overheads both 0) are ignored so a
 * pre-Xero backfill gap can't dilute the run-rate.
 */
export function computeCompanyBreakeven(
  months: CompanyPnlMonth[],
  todayIso: string,
  overheadWindow = 3,
  gpWindow = 12,
): CompanyBreakeven {
  const currentMonth = monthStartIso(todayIso)
  const complete = months
    .filter(m => m.month < currentMonth && (m.revenue !== 0 || m.overheads !== 0))
    .sort((a, b) => b.month.localeCompare(a.month))   // most recent first

  const gpMonths = complete.slice(0, gpWindow)
  const revSum = gpMonths.reduce((s, m) => s + m.revenue, 0)
  const gpSum = gpMonths.reduce((s, m) => s + m.grossProfit, 0)
  const npSum = gpMonths.reduce((s, m) => s + m.netProfit, 0)
  const trailingGpPct = revSum > 0 ? round2((gpSum / revSum) * 100) : null
  const trailingNpPct = revSum > 0 ? round2((npSum / revSum) * 100) : null

  const ohMonths = complete.slice(0, overheadWindow)
  const avgMonthlyOverheads = ohMonths.length > 0
    ? round2(ohMonths.reduce((s, m) => s + m.overheads, 0) / ohMonths.length)
    : null

  const breakevenRevenuePerMonth =
    avgMonthlyOverheads !== null && trailingGpPct !== null && trailingGpPct > 0
      ? round2(avgMonthlyOverheads / (trailingGpPct / 100))
      : null

  return {
    monthsUsed: complete.length,
    avgMonthlyOverheads,
    trailingGpPct,
    trailingNpPct,
    breakevenRevenuePerMonth,
  }
}
