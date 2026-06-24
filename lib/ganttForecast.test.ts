import { describe, it, expect } from 'vitest'
import type { GanttEntry } from '@/types'
import { plannedByWeek } from './ganttForecast'

// Three consecutive week-ending Fridays.
const fridays = ['2026-08-07', '2026-08-14', '2026-08-21'].map(d => new Date(`${d}T00:00:00`))
const sum = (m: Map<string, { rev: number; cost: number }>) =>
  Array.from(m.values()).reduce((a, v) => a + v.rev, 0)

describe('plannedByWeek', () => {
  it('spreads a parent-category bar across the weeks it covers', () => {
    const entries: GanttEntry[] = [{
      id: 'e', projectId: 'p', estimateId: 'est', category: 'Earthworks', crewType: 'Formation',
      budgetedRevenue: 9000, budgetedCost: 6000,
      segments: [{ id: 's', startDate: '2026-08-07', endDate: '2026-08-21', weekCount: 3, revenueAllocation: 9000, costAllocation: 6000 }],
      subtasks: [],
    }]
    const m = plannedByWeek(entries, fridays)
    expect(m.get('2026-08-07')?.rev).toBeCloseTo(3000)
    expect(m.get('2026-08-21')?.rev).toBeCloseTo(3000)
    expect(sum(m)).toBeCloseTo(9000)
  })

  it('INCLUDES auto-split type-line (costType subtask) claims — the Andrew iter4 bug', () => {
    // A SPLIT category: its own segments are cleared; the claim lives on the Labour line subtask.
    const entries: GanttEntry[] = [{
      id: 'e', projectId: 'p', estimateId: 'est', category: 'Decking', crewType: 'Formation',
      budgetedRevenue: 19746, budgetedCost: 13000,
      segments: [],   // parent cleared on split
      subtasks: [
        { id: 'lab', label: 'Labour', costType: 'labour',
          segments: [{ id: 'ls', startDate: '2026-08-07', endDate: '2026-08-21', weekCount: 3, revenueAllocation: 19746, costAllocation: 13000 }] },
      ],
    }]
    const m = plannedByWeek(entries, fridays)
    expect(sum(m)).toBeCloseTo(19746)              // was 0 before the fix
    expect(m.get('2026-08-21')?.rev).toBeCloseTo(19746 / 3)
  })

  it('includes a deeply NESTED type line at any depth', () => {
    const entries: GanttEntry[] = [{
      id: 'e', projectId: 'p', estimateId: 'est', category: 'Decking', crewType: 'Formation',
      budgetedRevenue: 6000, budgetedCost: 4000, segments: [],
      subtasks: [
        { id: 'grp', label: 'Stage 1', segments: [], subtasks: [
          { id: 'mat', label: 'Materials', costType: 'material',
            segments: [{ id: 'ms', startDate: '2026-08-07', endDate: '2026-08-07', weekCount: 1, revenueAllocation: 6000, costAllocation: 4000 }] },
        ] },
      ],
    }]
    expect(sum(plannedByWeek(entries, fridays))).toBeCloseTo(6000)
  })

  it('does NOT count manual (non-costType) subtasks', () => {
    const entries: GanttEntry[] = [{
      id: 'e', projectId: 'p', estimateId: 'est', category: 'Decking', crewType: 'Formation',
      budgetedRevenue: 0, budgetedCost: 0, segments: [],
      subtasks: [
        { id: 'note', label: 'Set out', segments: [{ id: 'ns', startDate: '2026-08-07', endDate: '2026-08-07', weekCount: 1, revenueAllocation: 5000, costAllocation: 0 }] },
      ],
    }]
    expect(sum(plannedByWeek(entries, fridays))).toBeCloseTo(0)
  })
})
