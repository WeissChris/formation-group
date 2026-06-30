import { describe, it, expect } from 'vitest'
import type { GanttEntry } from '@/types'
import { buildPhasedBudget, xeroMonthHeader, contiguousMonths, phasedBudgetToCsv, type BudgetLineItem } from './xccBudget'

const seg = (start: string, end: string, weeks: number, cost: number) =>
  ({ id: `${start}-${cost}`, startDate: start, endDate: end, weekCount: weeks, revenueAllocation: 0, costAllocation: cost })

const entry = (over: Partial<GanttEntry>): GanttEntry => ({
  id: 'e', projectId: 'p', estimateId: 'est', category: 'Decking', crewType: 'Formation',
  budgetedRevenue: 0, budgetedCost: 0, segments: [], subtasks: [], ...over,
})

const li = (over: Partial<BudgetLineItem>): BudgetLineItem =>
  ({ category: 'Decking', type: 'Material', total: 0, ...over })

describe('buildPhasedBudget', () => {
  it('phases a line item across months by the Gantt schedule (own-bar category)', () => {
    // 4-week bar from 2026-01-30: 1 week in Jan, 3 in Feb -> 25% / 75%.
    const gantt = [entry({ category: 'Decking', segments: [seg('2026-01-30', '2026-02-20', 4, 4000)] })]
    const b = buildPhasedBudget([li({ category: 'Decking', type: 'Material', total: 2000, xeroCategory: 'CON' })], gantt, '2026-01')
    expect(b.budget['CON']['2026-01']).toBeCloseTo(500)
    expect(b.budget['CON']['2026-02']).toBeCloseTo(1500)
    expect(b.months).toEqual(['2026-01', '2026-02'])
    expect(b.unallocatedCost).toBe(0)
  })

  it('sends an unscheduled category to the project start month', () => {
    const b = buildPhasedBudget([li({ category: 'Lighting', type: 'Material', total: 1000, xeroCategory: 'LITE' })], [], '2026-03')
    expect(b.budget['LITE']).toEqual({ '2026-03': 1000 })
  })

  it('counts a line with no XCC as unallocated, not in the budget', () => {
    const b = buildPhasedBudget([li({ total: 800 })], [], '2026-03')
    expect(b.unallocatedCost).toBe(800)
    expect(Object.keys(b.budget)).toEqual([])
  })

  it('uses the split type-line schedule per type, and aggregates same-XCC lines', () => {
    // Decking split: Labour scheduled Jan, Materials scheduled Feb.
    const gantt = [entry({
      category: 'Decking', segments: [],
      subtasks: [
        { id: 'lab', label: 'Labour', costType: 'labour', segments: [seg('2026-01-09', '2026-01-09', 1, 1000)] },
        { id: 'mat', label: 'Materials', costType: 'material', segments: [seg('2026-02-06', '2026-02-06', 1, 1000)] },
      ],
    })]
    const b = buildPhasedBudget([
      li({ type: 'Labour', total: 600, xeroCategory: 'WAGES' }),
      li({ type: 'Material', total: 400, xeroCategory: 'CON' }),
    ], gantt, '2026-01')
    expect(b.budget['WAGES']).toEqual({ '2026-01': 600 })   // follows the Labour bar (Jan)
    expect(b.budget['CON']).toEqual({ '2026-02': 400 })     // follows the Materials bar (Feb)
  })

  it('skips disabled and zero-cost lines', () => {
    const b = buildPhasedBudget([
      li({ total: 500, xeroCategory: 'CON', enabled: false }),
      li({ total: 0, xeroCategory: 'CON' }),
    ], [], '2026-03')
    expect(Object.keys(b.budget)).toEqual([])
    expect(b.unallocatedCost).toBe(0)
  })
})

describe('xeroMonthHeader / contiguousMonths', () => {
  it('formats a YYYY-MM key as Xero wants it', () => {
    expect(xeroMonthHeader('2025-07')).toBe('Jul-2025')
    expect(xeroMonthHeader('2026-06')).toBe('Jun-2026')
  })
  it('fills the months contiguously across a span (incl. a gap and a year boundary)', () => {
    expect(contiguousMonths(['2025-11', '2026-02'])).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(contiguousMonths([])).toEqual([])
  })
})

describe('phasedBudgetToCsv (Xero Budget Manager import format)', () => {
  it('emits *Account header, Name (Code) rows, 4dp amounts / 0, no Total', () => {
    const gantt = [entry({ category: 'Decking', segments: [seg('2026-01-30', '2026-02-20', 4, 4000)] })]
    const b = buildPhasedBudget([li({ category: 'Decking', type: 'Material', total: 2000, xeroCategory: '51311' })], gantt, '2026-01')
    const csv = phasedBudgetToCsv(b, code => code === '51311' ? 'Concrete' : code)
    const [header, row] = csv.split('\n')
    expect(header).toBe('*Account,Jan-2026,Feb-2026')
    expect(row).toBe('Concrete (51311),500.0000,1500.0000')
  })

  it('quotes account labels containing commas', () => {
    const b = buildPhasedBudget([li({ category: 'X', type: 'Material', total: 100, xeroCategory: '63100' })], [], '2025-04')
    const csv = phasedBudgetToCsv(b, () => 'Accommodation, Travel & Entertainment')
    expect(csv.split('\n')[1]).toBe('"Accommodation, Travel & Entertainment (63100)",100.0000')
  })
})
