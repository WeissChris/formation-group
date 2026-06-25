import { describe, it, expect } from 'vitest'
import type { GanttEntry } from '@/types'
import { plannedByWeek, claimLeafSegments } from './ganttForecast'

// Three consecutive week-ending Fridays.
const fridays = ['2026-08-07', '2026-08-14', '2026-08-21'].map(d => new Date(`${d}T00:00:00`))
const sum = (m: Map<string, { rev: number; cost: number }>) =>
  Array.from(m.values()).reduce((a, v) => a + v.rev, 0)
const seg = (start: string, end: string, weeks: number, rev: number, cost = 0) =>
  ({ id: `${start}-${rev}`, startDate: start, endDate: end, weekCount: weeks, revenueAllocation: rev, costAllocation: cost })
const entry = (over: Partial<GanttEntry>): GanttEntry => ({
  id: 'e', projectId: 'p', estimateId: 'est', category: 'Decking', crewType: 'Formation',
  budgetedRevenue: 0, budgetedCost: 0, segments: [], subtasks: [], ...over,
})

describe('plannedByWeek', () => {
  it('spreads a parent-category bar across the weeks it covers', () => {
    const m = plannedByWeek([entry({ segments: [seg('2026-08-07', '2026-08-21', 3, 9000)] })], fridays)
    expect(m.get('2026-08-07')?.rev).toBeCloseTo(3000)
    expect(sum(m)).toBeCloseTo(9000)
  })

  it('INCLUDES auto-split type-line claims — the Andrew iter4 bug', () => {
    const m = plannedByWeek([entry({
      segments: [],   // parent cleared on split
      subtasks: [{ id: 'lab', label: 'Labour', costType: 'labour', segments: [seg('2026-08-07', '2026-08-21', 3, 19746)] }],
    })], fridays)
    expect(sum(m)).toBeCloseTo(19746)
    expect(m.get('2026-08-21')?.rev).toBeCloseTo(19746 / 3)
  })

  it('does NOT count manual (non-costType) subtasks', () => {
    const m = plannedByWeek([entry({
      subtasks: [{ id: 'note', label: 'Set out', segments: [seg('2026-08-07', '2026-08-07', 1, 5000)] }],
    })], fridays)
    expect(sum(m)).toBeCloseTo(0)
  })
})

describe('claimLeafSegments (leaf roll-up, iter5)', () => {
  it('rolls a deeply-nested claim up at any depth', () => {
    const leaves = claimLeafSegments([
      { id: 'lab', label: 'Labour', costType: 'labour', segments: [], subtasks: [
        { id: 'bolts', label: 'Bolts', costType: 'labour', segments: [seg('2026-08-07', '2026-08-07', 1, 1200)] },
        { id: 'posts', label: 'Posts', costType: 'labour', segments: [seg('2026-08-07', '2026-08-07', 1, 800)] },
      ] },
    ])
    expect(leaves.map(l => l.seg.revenueAllocation)).toEqual([1200, 800])
    expect(leaves.every(l => l.costType === 'labour')).toBe(true)
  })

  it('does NOT double-count: a parent with children contributes only its children', () => {
    // The Labour parent still has its own (old) segment, but it now has children — so only the children count.
    const leaves = claimLeafSegments([
      { id: 'lab', label: 'Labour', costType: 'labour', segments: [seg('2026-08-07', '2026-08-21', 3, 19746)], subtasks: [
        { id: 'bolts', label: 'Bolts', costType: 'labour', segments: [seg('2026-08-07', '2026-08-07', 1, 1200)] },
      ] },
    ])
    expect(leaves.map(l => l.seg.revenueAllocation)).toEqual([1200])   // NOT [19746, 1200]
  })

  it('a childless type line is itself the leaf', () => {
    const leaves = claimLeafSegments([{ id: 'mat', label: 'Materials', costType: 'material', segments: [seg('2026-08-07', '2026-08-07', 1, 6000)] }])
    expect(leaves.map(l => l.seg.revenueAllocation)).toEqual([6000])
  })

  it('skips manual leaves with no costType', () => {
    expect(claimLeafSegments([{ id: 'n', label: 'note', segments: [seg('2026-08-07', '2026-08-07', 1, 5000)] }])).toEqual([])
  })
})
