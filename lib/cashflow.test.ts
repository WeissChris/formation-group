import { describe, it, expect } from 'vitest'
import { computeCashflow } from './cashflow'

const base = {
  todayIso: '2026-08-03',            // Monday; week 1 ends Fri 2026-08-07
  outstandingInvoices: [],
  plannedRevenue: [],
  scheduledCosts: [],
  weeklyOverheads: 0,
  receiptLagDays: 14,
}

describe('computeCashflow', () => {
  it('produces the requested number of consecutive Friday weeks', () => {
    const w = computeCashflow({ ...base, weeks: 13 })
    expect(w).toHaveLength(13)
    expect(w[0].friIso).toBe('2026-08-07')
    expect(w[1].friIso).toBe('2026-08-14')
  })

  it('lands an outstanding invoice at sent + lag', () => {
    const w = computeCashflow({ ...base, outstandingInvoices: [{ sentIso: '2026-08-04', amount: 10_000 }] })
    // 4 Aug + 14d = 18 Aug (Tue) -> Fri 21 Aug = week 3
    expect(w[2].inflow).toBe(10_000)
  })

  it('overdue money lands in week 1, not the past', () => {
    const w = computeCashflow({ ...base, outstandingInvoices: [{ sentIso: '2026-06-01', amount: 5_000 }] })
    expect(w[0].inflow).toBe(5_000)
  })

  it('planned revenue is lagged by the receipt delay', () => {
    const w = computeCashflow({ ...base, plannedRevenue: [{ weekEnding: '2026-08-14', amount: 20_000 }] })
    // invoice Fri 14 Aug + 14d = 28 Aug -> week 4
    expect(w[3].inflow).toBe(20_000)
  })

  it('costs hit their own week and overheads hit every week; cumulative runs', () => {
    const w = computeCashflow({
      ...base,
      weeks: 3,
      scheduledCosts: [{ weekEnding: '2026-08-14', amount: 8_000 }],
      weeklyOverheads: 1_000,
    })
    expect(w[0].outflow).toBe(1_000)
    expect(w[1].outflow).toBe(9_000)
    expect(w[2].cumulative).toBe(-11_000)
  })

  it('past planned rows are ignored (history, not receipts)', () => {
    const w = computeCashflow({ ...base, plannedRevenue: [{ weekEnding: '2026-07-03', amount: 9_000 }] })
    expect(w.reduce((s, x) => s + x.inflow, 0)).toBe(0)
  })
})
