import { describe, it, expect } from 'vitest'
import { getForecastCompletion, scheduleStatus, calcProjectHealth, getTargetMarginPct } from './projectHealth'
import type { Project, GanttEntry, ProjectBaseline } from '@/types'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    entity: 'formation',
    name: 'Test Project',
    address: '',
    clientName: '',
    status: 'active',
    contractValue: 100000,
    startDate: '2026-01-01',
    plannedCompletion: '2026-06-30',
    foreman: 'CAM',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function ganttEntry(overrides: Partial<GanttEntry> & { segments?: GanttEntry['segments'] } = {}): GanttEntry {
  return {
    id: 'g1',
    projectId: 'p1',
    estimateId: 'e1',
    category: 'Cat',
    crewType: 'Formation',
    budgetedRevenue: 10000,
    budgetedCost: 7000,
    segments: [
      { id: 's1', startDate: '2026-01-02', endDate: '2026-02-27', weekCount: 8, revenueAllocation: 10000, costAllocation: 7000 },
    ],
    ...overrides,
  }
}

describe('getTargetMarginPct (blended by subbie mix)', () => {
  it('falls back to 40% with no override and no cost mix', () => {
    expect(getTargetMarginPct(project())).toBe(40)
  })
  it('honours an explicit per-project override over the blend', () => {
    expect(getTargetMarginPct(project({ targetMarginPct: 33 }), { formationCost: 1000, subCost: 1000 })).toBe(33)
  })
  it('blends 40/30 cost-weighted: all-Formation -> 40, all-sub -> 30, 50/50 -> 35', () => {
    expect(getTargetMarginPct(project(), { formationCost: 1000, subCost: 0 })).toBe(40)
    expect(getTargetMarginPct(project(), { formationCost: 0, subCost: 1000 })).toBe(30)
    expect(getTargetMarginPct(project(), { formationCost: 1000, subCost: 1000 })).toBe(35)
  })
  it('a subbie-heavy job (~39% subby cost) targets ~36%, not 40% (the Joubert case)', () => {
    // FORMATION cost 76,847 + SUBCONTRACTOR cost 49,200 -> ~36.1% blended target, so 39% GP is on track.
    expect(getTargetMarginPct(project(), { formationCost: 76847, subCost: 49200 })).toBeCloseTo(36.1, 1)
  })
})

describe('getForecastCompletion', () => {
  it('prefers an explicit project.forecastCompletion override', () => {
    const p = project({ forecastCompletion: '2026-08-15', plannedCompletion: '2026-06-30' })
    expect(getForecastCompletion(p, [])).toBe('2026-08-15')
  })

  it('derives from the latest Gantt segment end when no override', () => {
    const p = project({ plannedCompletion: '2026-06-30' })
    const entries = [
      ganttEntry({ segments: [
        { id: 'a', startDate: '2026-01-02', endDate: '2026-02-27', weekCount: 8, revenueAllocation: 0, costAllocation: 0 },
      ]}),
      ganttEntry({ id: 'g2', segments: [
        { id: 'b', startDate: '2026-03-06', endDate: '2026-07-10', weekCount: 19, revenueAllocation: 0, costAllocation: 0 },
      ]}),
    ]
    expect(getForecastCompletion(p, entries)).toBe('2026-07-10')
  })

  it('falls back to plannedCompletion when no override and no gantt', () => {
    const p = project({ plannedCompletion: '2026-06-30' })
    expect(getForecastCompletion(p, [])).toBe('2026-06-30')
    expect(getForecastCompletion(p)).toBe('2026-06-30') // undefined gantt arg
  })

  it('ignores segments with missing endDate', () => {
    const p = project({ plannedCompletion: '2026-06-30' })
    const entries = [ganttEntry({ segments: [
      { id: 'a', startDate: '2026-01-02', endDate: '', weekCount: 0, revenueAllocation: 0, costAllocation: 0 },
    ]})]
    expect(getForecastCompletion(p, entries)).toBe('2026-06-30')
  })
})

describe('scheduleStatus', () => {
  const baseline = (overrides: Partial<ProjectBaseline> = {}): ProjectBaseline => ({
    capturedAt: '2026-01-01T00:00:00Z',
    contractValue: 100000,
    costEstimate: 60000,
    grossProfit: 40000,
    gpPercent: 40,
    categories: [],
    plannedCompletion: '2026-06-30',
    ...overrides,
  })

  it('returns green when forecast == planned (no slippage)', () => {
    const p = project({
      baseline: baseline(),
      forecastCompletion: '2026-06-30',
    })
    const { status, daysSlippage } = scheduleStatus(p)
    expect(status).toBe('green')
    expect(daysSlippage).toBe(0)
  })

  it('returns amber for 1-7 day slip', () => {
    const p = project({
      baseline: baseline({ plannedCompletion: '2026-06-30' }),
      forecastCompletion: '2026-07-05', // 5 days late
    })
    expect(scheduleStatus(p).status).toBe('amber')
  })

  it('returns red for >7 day slip', () => {
    const p = project({
      baseline: baseline({ plannedCompletion: '2026-06-30' }),
      forecastCompletion: '2026-07-15', // 15 days late
    })
    expect(scheduleStatus(p).status).toBe('red')
  })

  it('returns green with null slippage when no baseline', () => {
    const p = project({ baseline: undefined })
    expect(scheduleStatus(p)).toEqual({ status: 'green', daysSlippage: null })
  })

  it('uses Gantt-derived forecast when no explicit forecastCompletion', () => {
    const p = project({
      baseline: baseline({ plannedCompletion: '2026-06-30' }),
      plannedCompletion: '2026-06-30',
      // no explicit forecastCompletion → comes from gantt
    })
    const lateGantt = [ganttEntry({ segments: [
      { id: 'a', startDate: '2026-01-02', endDate: '2026-07-20', weekCount: 1, revenueAllocation: 0, costAllocation: 0 },
    ]})]
    expect(scheduleStatus(p, lateGantt).status).toBe('red') // 20 days late
  })
})

describe('calcProjectHealth', () => {
  const baseline = (overrides: Partial<ProjectBaseline> = {}): ProjectBaseline => ({
    capturedAt: '2026-01-01T00:00:00Z',
    contractValue: 100000,
    costEstimate: 60000,
    grossProfit: 40000,
    gpPercent: 40,
    categories: [],
    plannedCompletion: '2026-06-30',
    ...overrides,
  })

  it('green when forecast GP at target, cost on baseline, on schedule', () => {
    const p = project({ baseline: baseline(), forecastCompletion: '2026-06-30' })
    const h = calcProjectHealth(p, [], [ganttEntry({ budgetedCost: 60000 })], [])
    expect(h.status).toBe('green')
    expect(h.flags).toHaveLength(0)
  })

  it('flags amber when forecast GP below 40% target', () => {
    const p = project({ baseline: baseline() })
    // budgetedCost 70000 against contract 100000 → forecastGP = 30% → amber (>= 30 < 40)
    const h = calcProjectHealth(p, [], [ganttEntry({ budgetedCost: 70000 })], [])
    expect(h.forecastGP).toBeCloseTo(30, 1)
    expect(h.flags.some(f => f.reason.includes('GP below target'))).toBe(true)
  })

  it('flags red when forecast GP below 30%', () => {
    const p = project({ baseline: baseline() })
    const h = calcProjectHealth(p, [], [ganttEntry({ budgetedCost: 80000 })], [])
    expect(h.forecastGP).toBeCloseTo(20, 1)
    const gpFlag = h.flags.find(f => f.reason.includes('GP below target'))
    expect(gpFlag?.status).toBe('red')
  })

  it('flags cost variance when forecast cost exceeds baseline by >5%', () => {
    const p = project({ baseline: baseline({ costEstimate: 60000 }) })
    // Forecast cost 64000 → +6.67% → amber
    const h = calcProjectHealth(p, [], [ganttEntry({ budgetedCost: 64000 })], [])
    expect(h.costVariancePct).toBeCloseTo(6.67, 1)
    expect(h.flags.some(f => f.reason.includes('Cost increasing'))).toBe(true)
  })

  it('rolls red over amber over green', () => {
    const p = project({
      baseline: baseline(),
      forecastCompletion: '2026-07-25', // 25 days late → red
    })
    const h = calcProjectHealth(p, [], [ganttEntry({ budgetedCost: 64000 })], []) // amber on cost
    expect(h.status).toBe('red') // red wins
  })
})
