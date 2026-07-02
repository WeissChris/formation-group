import { describe, it, expect } from 'vitest'
import type { Estimate, EstimateLineItem, GanttEntry, WeeklyActual, SubcontractorPackage } from '@/types'
import { computeScorecard, scheduleProgress, segmentElapsed, disciplineProgress } from './siteScorecard'

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
    // Subbies are committed up-front: fully committed AT the allowance is ON budget, not over.
    expect(sc.levers.find(l => l.key === 'subbies')?.status).toBe('good')
  })

  it('flags subbies only when committed OVER the allowance', () => {
    const sc = computeScorecard({
      estimate, actuals: [actual(5000, 5000)], subbies: [subbie(11500)], gantt: ganttHalf, today: '2026-08-07',
    })
    expect(sc.levers.find(l => l.key === 'subbies')?.status).toBe('over')   // 115% committed
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

  it('uses REAL Xero timesheet hours for the labour lever when provided (at $68/hr)', () => {
    // 10000 labour budget = 147.06 allowed hours. 73.53 real hours at half-way = exactly on plan.
    const hours = 10000 / 68 / 2
    const sc = computeScorecard({
      estimate, actuals: [actual(5000, 999999)],   // logged labour $ is IGNORED once hours exist
      subbies: [subbie(10000)], gantt: ganttHalf, today: '2026-08-07', actualLabourHours: hours,
    })
    const lab = sc.levers.find(l => l.key === 'labour')!
    expect(lab.actual).toBeCloseTo(5000, 4)        // hours * 68
    expect(lab.status).toBe('good')
    expect(sc.score).toBe(100)
  })

  it('falls back to logged labour $ when hours are null (not yet synced)', () => {
    const sc = computeScorecard({
      estimate, actuals: [actual(5000, 7500)], subbies: [subbie(10000)], gantt: ganttHalf,
      today: '2026-08-07', actualLabourHours: null,
    })
    expect(sc.levers.find(l => l.key === 'labour')?.actual).toBe(7500)
  })

  it('uses Xero supply spend for the materials lever when provided, ignoring logged $', () => {
    const sc = computeScorecard({
      estimate, actuals: [actual(999999, 5000)], subbies: [subbie(10000)], gantt: ganttHalf,
      today: '2026-08-07', actualSupplyCost: 5000,
    })
    const mat = sc.levers.find(l => l.key === 'materials')!
    expect(mat.actual).toBe(5000)
    expect(mat.status).toBe('good')
  })

  it('falls back to logged supply $ when Xero supply is null', () => {
    const sc = computeScorecard({
      estimate, actuals: [actual(4000, 5000)], subbies: [], gantt: ganttHalf,
      today: '2026-08-07', actualSupplyCost: null,
    })
    expect(sc.levers.find(l => l.key === 'materials')?.actual).toBe(4000)
  })

  it('judges labour against LABOUR-work elapsed, not the blended job progress', () => {
    // Subbie-heavy schedule mostly elapsed; the labour type-line has not started yet. Low labour
    // usage must NOT read as a huge under-run (the "score pinned at 120" distortion).
    const splitGantt: GanttEntry[] = [{
      id: 'e', projectId: 'p', estimateId: 'est', category: 'Cat', crewType: 'Formation',
      budgetedRevenue: 0, budgetedCost: 30000, segments: [],
      subtasks: [
        { id: 'sub', label: 'Subcontractor', costType: 'subcontractor',
          segments: [{ id: 's1', startDate: '2026-07-27', endDate: '2026-08-06', weekCount: 2, revenueAllocation: 10000, costAllocation: 10000 }] },
        { id: 'lab', label: 'Labour', costType: 'labour',
          segments: [{ id: 's2', startDate: '2026-08-10', endDate: '2026-08-21', weekCount: 2, revenueAllocation: 10000, costAllocation: 10000 }] },
        { id: 'mat', label: 'Materials', costType: 'material',
          segments: [{ id: 's3', startDate: '2026-08-10', endDate: '2026-08-21', weekCount: 2, revenueAllocation: 10000, costAllocation: 10000 }] },
      ],
    }]
    const today = '2026-08-07'   // subbie work done; labour + materials not started
    expect(disciplineProgress(splitGantt, today, ['labour'])).toBe(0)
    expect(scheduleProgress(splitGantt, today)).toBeGreaterThan(0.3)   // blended runs ahead

    const sc = computeScorecard({
      estimate, actuals: [], subbies: [subbie(10000)], gantt: splitGantt, today,
      actualLabourHours: 5,   // negligible hours - labour hasn't started
    })
    const lab = sc.levers.find(l => l.key === 'labour')!
    expect(lab.progressPct).toBe(0)
    expect(lab.status).toBe('na')            // too early for ITS schedule, not a huge under-run
    // Projection assumes labour lands ON budget (no extrapolation from a not-started discipline),
    // so the score cannot be inflated by the early subbie-heavy blended progress.
    expect(sc.projectedCost).toBeCloseTo(30000, 0)
    expect(sc.score).toBe(100)
  })
})
