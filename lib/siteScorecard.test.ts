import { describe, it, expect } from 'vitest'
import type { Estimate, EstimateLineItem, GanttEntry, WeeklyActual, SubcontractorPackage } from '@/types'
import { computeScorecard, scheduleProgress, segmentElapsed } from './siteScorecard'

// 2026-08-03 = Mon, 2026-08-07 = Fri, 2026-08-14 = Fri. No VIC public holidays in this fortnight.
const li = (type: EstimateLineItem['type'], total: number, i: number): EstimateLineItem => ({
  id: `li${i}`, estimateId: 'est', displayOrder: String(i), category: 'Cat', description: type,
  type, units: 1, uom: 'EA', unitCost: total, total, markupPercent: 0, revenue: total,
  crewType: type === 'Subcontractor' ? 'Subcontractor' : 'Formation',
})
const estimate: Estimate = {
  id: 'est', projectId: 'p', projectName: 'Job', version: 1, status: 'accepted',
  defaultMarkupFormation: 0, defaultMarkupSubcontractor: 0,
  lineItems: [li('Labour', 10000, 1), li('Material', 10000, 2), li('Subcontractor', 10000, 3)],
  createdAt: '2026-08-01', updatedAt: '2026-08-01',
}
const ganttHalf: GanttEntry[] = [{
  id: 'e', projectId: 'p', estimateId: 'est', category: 'Cat', crewType: 'Formation',
  budgetedRevenue: 0, budgetedCost: 30000, subtasks: [],
  segments: [{ id: 's', startDate: '2026-08-03', endDate: '2026-08-14', weekCount: 2, revenueAllocation: 30000, costAllocation: 30000 }],
}]
const actual = (supply: number, labour: number): WeeklyActual =>
  ({ id: `a${supply}${labour}`, projectId: 'p', category: 'Cat', weekEnding: '2026-08-07', supplyCost: supply, labourCost: labour })
const subbie = (v: number): SubcontractorPackage =>
  ({ id: 'sub', projectId: 'p', name: 'Sub', trade: 'Concrete', approvedValue: v, variations: 0, invoicedToDate: 0, createdAt: '2026-08-01' })

describe('segmentElapsed / scheduleProgress', () => {
  it('is 0 before start, 1 after end, ~half at the midpoint', () => {
    expect(segmentElapsed('2026-08-03', '2026-08-14', '2026-08-01')).toBe(0)
    expect(segmentElapsed('2026-08-03', '2026-08-14', '2026-08-20')).toBe(1)
    expect(segmentElapsed('2026-08-03', '2026-08-14', '2026-08-07')).toBeCloseTo(0.5, 6)
  })
  it('weights progress by segment cost', () => {
    expect(scheduleProgress(ganttHalf, '2026-08-07')).toBeCloseTo(0.5, 6)
  })
})

describe('computeScorecard', () => {
  it('scores 100 (good) when every lever projects on budget at half-way', () => {
    const sc = computeScorecard({
      estimate, actuals: [actual(5000, 5000)], subbies: [subbie(10000)], gantt: ganttHalf, today: '2026-08-07',
    })
    expect(sc.progressPct).toBeCloseTo(0.5, 6)
    expect(sc.score).toBe(100)
    expect(sc.status).toBe('good')
    expect(sc.budgetCost).toBe(30000)
    expect(sc.projectedCost).toBeCloseTo(30000, 4)
  })

  it('drops the score and flags over when labour is running hot', () => {
    const sc = computeScorecard({
      estimate, actuals: [actual(5000, 7500)], subbies: [subbie(10000)], gantt: ganttHalf, today: '2026-08-07',
    })
    // projected = 15000 (labour) + 10000 (mat) + 10000 (sub) = 35000 -> 100*30000/35000 ~= 86
    expect(sc.score).toBe(86)
    expect(sc.status).toBe('over')
    expect(sc.levers.find(l => l.key === 'labour')?.status).toBe('over')
    expect(sc.levers.find(l => l.key === 'materials')?.status).toBe('good')
  })

  it('is too early to score before enough progress, but still lists levers', () => {
    const sc = computeScorecard({
      estimate, actuals: [actual(2000, 2000)], subbies: [], gantt: ganttHalf, today: '2026-08-01',
    })
    expect(sc.progressPct).toBe(0)
    expect(sc.score).toBeNull()
    expect(sc.status).toBe('na')
    expect(sc.levers).toHaveLength(3)
  })

  it('has no budget and cannot score without an estimate', () => {
    const sc = computeScorecard({ estimate: null, actuals: [], subbies: [], gantt: ganttHalf, today: '2026-08-07' })
    expect(sc.hasBudget).toBe(false)
    expect(sc.score).toBeNull()
  })
})
