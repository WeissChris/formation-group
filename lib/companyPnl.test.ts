import { describe, it, expect } from 'vitest'
import { parseCompanyPnl, computeCompanyBreakeven, monthStartIso, type AccountClassInfo, type CompanyPnlMonth, type PnlReport } from './companyPnl'
import { monthStarts, monthEnd } from './xeroPnlSync'

// ── parseCompanyPnl ───────────────────────────────────────────────────────────

const accounts = new Map<string, AccountClassInfo>([
  ['id-sales', { cls: 'REVENUE', type: 'SALES', name: 'Sales' }],
  ['id-materials', { cls: 'EXPENSE', type: 'DIRECTCOSTS', name: 'Materials - Landscape' }],
  ['id-prod-wages', { cls: 'EXPENSE', type: 'DIRECTCOSTS', name: 'Wages & Salaries - Production' }],
  ['id-rent', { cls: 'EXPENSE', type: 'OVERHEADS', name: 'Rent' }],
  ['id-admin-wages', { cls: 'EXPENSE', type: 'WAGESEXPENSE', name: 'Wages & Salaries - Admin' }],
  ['id-depn', { cls: 'EXPENSE', type: 'DEPRECIATN', name: 'Depreciation' }],
])

const row = (accountId: string | null, label: string, amount: string, rowType = 'Row') => ({
  RowType: rowType,
  Cells: [
    { Value: label, Attributes: accountId ? [{ Id: 'account', Value: accountId }] : undefined },
    { Value: amount },
  ],
})

const report: PnlReport = {
  Reports: [{
    Rows: [
      { RowType: 'Header', Cells: [{ Value: '' }, { Value: '31 Jul 26' }] },
      { RowType: 'Section', Title: 'Income', Rows: [row('id-sales', 'Sales', '100,000.00')] },
      { RowType: 'Section', Title: 'Less Cost of Sales', Rows: [
        row('id-materials', 'Materials - Landscape', '35000.00'),
        row('id-prod-wages', 'Wages & Salaries - Production', '25000.00'),
      ] },
      // Summary rows carry no account attribute and must never be counted.
      { RowType: 'Section', Title: '', Rows: [row(null, 'Gross Profit', '40000.00', 'SummaryRow')] },
      { RowType: 'Section', Title: 'Less Operating Expenses', Rows: [
        row('id-rent', 'Rent', '8000.00'),
        row('id-admin-wages', 'Wages & Salaries - Admin', '12,000.00'),
        row('id-depn', 'Depreciation', '2000.00'),
        row('id-unknown', 'Mystery account', '500.00'),
      ] },
      { RowType: 'Section', Title: '', Rows: [row(null, 'Net Profit', '18000.00', 'SummaryRow')] },
    ],
  }],
}

describe('parseCompanyPnl', () => {
  it('buckets by account class, not section title', () => {
    const t = parseCompanyPnl(report, accounts)
    expect(t.revenue).toBe(100000)
    expect(t.costOfSales).toBe(60000)     // DIRECTCOSTS incl. production wages
    expect(t.overheads).toBe(22000)       // OVERHEADS + WAGESEXPENSE + DEPRECIATN
  })

  it('never counts summary rows (Gross/Net Profit) - no account attribute', () => {
    const t = parseCompanyPnl(report, accounts)
    // If summaries leaked in, revenue or overheads would jump by 40k/18k.
    expect(t.revenue + t.costOfSales + t.overheads).toBe(182000)
  })

  it('keeps a per-account overhead breakdown', () => {
    const t = parseCompanyPnl(report, accounts)
    expect(t.overheadsByAccount['Rent']).toBe(8000)
    expect(t.overheadsByAccount['Wages & Salaries - Admin']).toBe(12000)
  })

  it('counts unresolvable accounts instead of guessing', () => {
    const t = parseCompanyPnl(report, accounts)
    expect(t.unmatchedRows).toBe(1)
  })

  it('handles an empty report', () => {
    const t = parseCompanyPnl({}, accounts)
    expect(t.revenue).toBe(0)
    expect(t.overheads).toBe(0)
  })
})

// ── computeCompanyBreakeven ───────────────────────────────────────────────────

const month = (m: string, revenue: number, gp: number, overheads: number): CompanyPnlMonth => ({
  month: m, entity: 'formation', revenue, costOfSales: revenue - gp, grossProfit: gp,
  overheads, netProfit: gp - overheads, overheadsByAccount: {},
})

describe('computeCompanyBreakeven', () => {
  const months = [
    month('2026-05-01', 200000, 80000, 45000),
    month('2026-06-01', 250000, 100000, 50000),
    month('2026-07-01', 150000, 60000, 55000),
    month('2026-08-01', 40000, 16000, 12000),   // current month - partial, must be ignored
  ]

  it('averages overheads over the last 3 COMPLETE months', () => {
    const b = computeCompanyBreakeven(months, '2026-08-15')
    expect(b.avgMonthlyOverheads).toBe(50000)   // (45k + 50k + 55k) / 3
  })

  it('trailing GP% is revenue-weighted across complete months', () => {
    const b = computeCompanyBreakeven(months, '2026-08-15')
    expect(b.trailingGpPct).toBe(40)            // 240k GP / 600k revenue
  })

  it('breakeven = overheads / GP%', () => {
    const b = computeCompanyBreakeven(months, '2026-08-15')
    expect(b.breakevenRevenuePerMonth).toBe(125000)   // 50k / 0.40
  })

  it('NP% follows the same window', () => {
    const b = computeCompanyBreakeven(months, '2026-08-15')
    expect(b.trailingNpPct).toBe(15)            // (240k - 150k) / 600k
  })

  it('ignores empty backfill months so they cannot dilute the run-rate', () => {
    const withGap = [month('2026-04-01', 0, 0, 0), ...months]
    const b = computeCompanyBreakeven(withGap, '2026-08-15')
    expect(b.avgMonthlyOverheads).toBe(50000)
  })

  it('returns nulls when there is no usable history', () => {
    const b = computeCompanyBreakeven([], '2026-08-15')
    expect(b.breakevenRevenuePerMonth).toBeNull()
    expect(b.trailingGpPct).toBeNull()
  })
})

// ── month helpers ─────────────────────────────────────────────────────────────

describe('month helpers', () => {
  it('monthStarts spans the lookback oldest-first including the current month', () => {
    expect(monthStarts('2026-08-15', 3)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
  })

  it('monthStarts crosses year boundaries', () => {
    expect(monthStarts('2026-01-10', 3)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01'])
  })

  it('monthEnd handles 30/31-day months and February', () => {
    expect(monthEnd('2026-07-01')).toBe('2026-07-31')
    expect(monthEnd('2026-06-01')).toBe('2026-06-30')
    expect(monthEnd('2028-02-01')).toBe('2028-02-29')   // leap year
  })

  it('monthStartIso truncates any ISO date to its month', () => {
    expect(monthStartIso('2026-08-15')).toBe('2026-08-01')
  })
})
