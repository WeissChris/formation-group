import { describe, it, expect } from 'vitest'
import { reconcileLabour, computeLabourPace, isLabourAccount } from './labour'
import type { EstimateLineItem, WeeklyActual } from '@/types'

interface CostRow {
  account_name: string
  amount_ex_gst: number
  last_bill_date?: string | null
}

function lineItem(overrides: Partial<EstimateLineItem>): EstimateLineItem {
  return {
    id: 'li',
    estimateId: 'e1',
    displayOrder: '1',
    category: 'Test',
    description: 'X',
    type: 'Material',
    units: 1,
    uom: 'ea',
    unitCost: 100,
    total: 100,
    markupPercent: 40,
    revenue: 140,
    crewType: 'Formation',
    ...overrides,
  }
}

function actual(overrides: Partial<WeeklyActual>): WeeklyActual {
  return {
    id: 'a',
    projectId: 'p1',
    category: 'Test',
    weekEnding: '2026-05-01',
    supplyCost: 0,
    labourCost: 1000,
    ...overrides,
  }
}

describe('isLabourAccount', () => {
  it('matches the production labour accounts', () => {
    expect(isLabourAccount('Wages & Salaries - Production')).toBe(true)
    expect(isLabourAccount('Superannuation - Production')).toBe(true)
  })

  it('case-insensitive and trims whitespace', () => {
    expect(isLabourAccount(' WAGES & SALARIES - PRODUCTION ')).toBe(true)
    expect(isLabourAccount('superannuation - production')).toBe(true)
  })

  it('REJECTS non-production / non-cogs labour accounts (Workcover, director wages)', () => {
    // Chris's decision: Workcover allocated centrally, not per-project. Director wages = NP.
    expect(isLabourAccount('Workcover (Workers Compensation) - Production')).toBe(false)
    expect(isLabourAccount('Wages - Director')).toBe(false)
    expect(isLabourAccount('Wages & Salaries - Administration')).toBe(false)
    expect(isLabourAccount('Subcontractors')).toBe(false)
  })
})

describe('reconcileLabour', () => {
  it('sums Wages + Superannuation from Xero rollup', () => {
    const costRows: CostRow[] = [
      { account_name: 'Wages & Salaries - Production', amount_ex_gst: 10_000 },
      { account_name: 'Superannuation - Production', amount_ex_gst: 1_100 },
      { account_name: 'Subcontractors', amount_ex_gst: 50_000 }, // not labour — excluded
    ]
    const result = reconcileLabour(costRows, [])
    expect(result.xeroLabour).toBe(11_100)
    expect(result.foremanLabour).toBe(0)
  })

  it('sums WeeklyActuals.labourCost for foreman side', () => {
    const actuals = [
      actual({ id: 'a', labourCost: 1_000 }),
      actual({ id: 'b', labourCost: 2_000 }),
      actual({ id: 'c', labourCost: 500, supplyCost: 9_999 }), // supplyCost excluded
    ]
    const result = reconcileLabour([], actuals)
    expect(result.foremanLabour).toBe(3_500)
    expect(result.xeroLabour).toBe(0)
  })

  it('computes drift and driftPct (Xero minus foreman)', () => {
    const costRows: CostRow[] = [
      { account_name: 'Wages & Salaries - Production', amount_ex_gst: 11_000 },
    ]
    const actuals = [actual({ labourCost: 10_000 })]
    const result = reconcileLabour(costRows, actuals)
    expect(result.drift).toBe(1_000)
    expect(result.driftPct).toBe(10)
  })

  it('driftPct is 0 when foreman is 0 (avoids div/zero)', () => {
    const result = reconcileLabour(
      [{ account_name: 'Wages & Salaries - Production', amount_ex_gst: 5_000 }],
      [],
    )
    expect(result.driftPct).toBe(0)
  })

  it('flags payrollLag when foreman has recent entries but Xero is stale (> 14 days behind)', () => {
    // Today: 28 May 2026
    const today = new Date('2026-05-28T00:00:00Z')
    const costRows: CostRow[] = [
      // Last Xero labour bill on 1 May — 27 days old, definitely stale
      { account_name: 'Wages & Salaries - Production', amount_ex_gst: 5_000, last_bill_date: '2026-05-01' },
    ]
    const actuals = [
      actual({ labourCost: 2_000, weekEnding: '2026-05-22' }), // 6 days ago — recent
    ]
    const result = reconcileLabour(costRows, actuals, today)
    expect(result.payrollLag).toBe(true)
  })

  it('does NOT flag payrollLag when both sides are recent', () => {
    const today = new Date('2026-05-28T00:00:00Z')
    const costRows: CostRow[] = [
      { account_name: 'Wages & Salaries - Production', amount_ex_gst: 5_000, last_bill_date: '2026-05-22' },
    ]
    const actuals = [actual({ labourCost: 2_000, weekEnding: '2026-05-22' })]
    const result = reconcileLabour(costRows, actuals, today)
    expect(result.payrollLag).toBe(false)
  })

  it('does NOT flag payrollLag when foreman itself is stale', () => {
    const today = new Date('2026-05-28T00:00:00Z')
    const costRows: CostRow[] = []
    const actuals = [actual({ labourCost: 2_000, weekEnding: '2026-04-01' })] // 57 days old
    const result = reconcileLabour(costRows, actuals, today)
    expect(result.payrollLag).toBe(false)
  })

  it('returns latest dates for both sides', () => {
    const costRows: CostRow[] = [
      { account_name: 'Wages & Salaries - Production', amount_ex_gst: 1_000, last_bill_date: '2026-05-10' },
      { account_name: 'Wages & Salaries - Production', amount_ex_gst: 1_000, last_bill_date: '2026-05-20' },
    ]
    const actuals = [
      actual({ weekEnding: '2026-05-15' }),
      actual({ weekEnding: '2026-05-22' }),
    ]
    const result = reconcileLabour(costRows, actuals)
    expect(result.latestXeroBill).toBe('2026-05-20')
    expect(result.latestForemanWeek).toBe('2026-05-22')
  })
})

describe('computeLabourPace', () => {
  it('sums allowance from Labour-type line items (cost side)', () => {
    const lineItems = [
      lineItem({ type: 'Labour', total: 5_000, revenue: 7_000 }),
      lineItem({ type: 'Labour', total: 3_000, revenue: 4_200 }),
      lineItem({ type: 'Material', total: 999, revenue: 999 }), // not labour — excluded
    ]
    const pace = computeLabourPace(lineItems, null, 0, undefined)
    expect(pace.allowance).toBe(8_000)
  })

  it('prefers Xero over foreman for spent', () => {
    const lineItems = [lineItem({ type: 'Labour', total: 10_000 })]
    const pace = computeLabourPace(lineItems, 4_000, 3_500, undefined)
    expect(pace.spent).toBe(4_000)
    expect(pace.spentSource).toBe('xero')
  })

  it('falls back to foreman when Xero is 0/null', () => {
    const lineItems = [lineItem({ type: 'Labour', total: 10_000 })]
    const pace = computeLabourPace(lineItems, null, 3_500, undefined)
    expect(pace.spent).toBe(3_500)
    expect(pace.spentSource).toBe('foreman')
  })

  it('returns none source when nothing spent', () => {
    const pace = computeLabourPace([lineItem({ type: 'Labour', total: 10_000 })], null, 0, undefined)
    expect(pace.spentSource).toBe('none')
    expect(pace.spent).toBe(0)
  })

  it('computes pctSpent (or null if allowance is 0)', () => {
    expect(computeLabourPace([lineItem({ type: 'Labour', total: 10_000 })], 4_000, 0, undefined).pctSpent).toBe(40)
    expect(computeLabourPace([], 4_000, 0, undefined).pctSpent).toBeNull()
  })

  it('computes weekly burn rate over weeks elapsed since startDate', () => {
    const today = new Date('2026-05-29T00:00:00Z') // exactly 8 weeks after 3 Apr
    const pace = computeLabourPace(
      [lineItem({ type: 'Labour', total: 10_000 })],
      8_000, 0, '2026-04-03', today,
    )
    expect(pace.weeklyBurnRate).toBe(1_000) // 8000 / 8 weeks
  })

  it('weeklyBurnRate null when start date missing', () => {
    const pace = computeLabourPace([lineItem({ type: 'Labour', total: 10_000 })], 4_000, 0, undefined)
    expect(pace.weeklyBurnRate).toBeNull()
  })

  it('weeklyBurnRate null when no weeks have elapsed (start date in the future)', () => {
    const today = new Date('2026-05-01T00:00:00Z')
    const pace = computeLabourPace(
      [lineItem({ type: 'Labour', total: 10_000 })],
      1_000, 0, '2026-06-01', today,
    )
    expect(pace.weeklyBurnRate).toBeNull()
  })

  it('weeksLeftAtBurn = remaining allowance / burn', () => {
    const today = new Date('2026-05-29T00:00:00Z')
    const pace = computeLabourPace(
      [lineItem({ type: 'Labour', total: 10_000 })],
      4_000, 0, '2026-04-03', today, // 4000 spent over 8 weeks = 500/wk, 6000 left, 12 weeks
    )
    expect(pace.weeksLeftAtBurn).toBe(12)
  })

  it('weeksLeftAtBurn null when over-allowance', () => {
    const today = new Date('2026-05-29T00:00:00Z')
    const pace = computeLabourPace(
      [lineItem({ type: 'Labour', total: 5_000 })],
      8_000, 0, '2026-04-03', today,
    )
    expect(pace.weeksLeftAtBurn).toBeNull()
  })
})
