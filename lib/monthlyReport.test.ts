import { describe, it, expect } from 'vitest'
import { monthIsoOf, addMonths, inMonth, monthlyInvoiced, invoicedTrend, pnlMonthTotals, pnlFyTotals, type InvoicedItem } from './monthlyReport'
import type { CompanyPnlMonth } from './companyPnl'

const items: InvoicedItem[] = [
  { entity: 'formation', dateIso: '2026-08-07', amount: 10000 },
  { entity: 'formation', dateIso: '2026-08-21', amount: 5000 },
  { entity: 'lume', dateIso: '2026-08-14', amount: 2000 },
  { entity: 'design', dateIso: '2026-07-31', amount: 3000 },
  { entity: 'formation', dateIso: '', amount: 999 },   // undated - never counted
]

describe('month helpers', () => {
  it('monthIsoOf / addMonths cross year boundaries', () => {
    expect(monthIsoOf(new Date(2026, 7, 7))).toBe('2026-08-01')
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01')
    expect(addMonths('2026-11-01', 2)).toBe('2027-01-01')
  })
  it('inMonth compares calendar months', () => {
    expect(inMonth('2026-08-31', '2026-08-01')).toBe(true)
    expect(inMonth('2026-09-01', '2026-08-01')).toBe(false)
  })
})

describe('monthlyInvoiced / invoicedTrend', () => {
  it('slices by month and splits by entity', () => {
    const aug = monthlyInvoiced(items, '2026-08-01')
    expect(aug.total).toBe(17000)
    expect(aug.byEntity).toEqual({ formation: 15000, lume: 2000, design: 0 })
    expect(monthlyInvoiced(items, '2026-07-01').byEntity.design).toBe(3000)
  })
  it('trend runs oldest-first ending at the reported month', () => {
    const t = invoicedTrend(items, '2026-08-01', 3)
    expect(t.map(x => x.monthIso)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
    expect(t[2].total).toBe(17000)
    expect(t[1].total).toBe(3000)
  })
})

describe('pnl totals', () => {
  const m = (month: string, entity: 'formation' | 'lume', revenue: number): CompanyPnlMonth => ({
    month, entity, revenue, costOfSales: revenue * 0.6, grossProfit: revenue * 0.4,
    overheads: 100, netProfit: revenue * 0.4 - 100, overheadsByAccount: {},
  })
  const months = [m('2026-07-01', 'formation', 100000), m('2026-07-01', 'lume', 20000), m('2026-08-01', 'formation', 50000)]

  it('sums entities for one month', () => {
    const jul = pnlMonthTotals(months, '2026-07-01')!
    expect(jul.revenue).toBe(120000)
    expect(jul.overheads).toBe(200)
    expect(pnlMonthTotals(months, '2026-09-01')).toBeNull()
  })
  it('FYTD spans July through the reported month only', () => {
    const fytd = pnlFyTotals(months, 2026, '2026-08-01')!
    expect(fytd.revenue).toBe(170000)
    expect(pnlFyTotals(months, 2026, '2026-07-01')!.revenue).toBe(120000)
    expect(pnlFyTotals(months, 2025, '2026-06-01')).toBeNull()
  })
})
