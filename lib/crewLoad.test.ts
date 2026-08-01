import { describe, it, expect } from 'vitest'
import type { GanttEntry } from '@/types'
import { computeCrewLoad } from './crewLoad'

const entry = (over: Partial<GanttEntry>): GanttEntry => ({
  id: 'e', projectId: 'p', estimateId: 'est', category: 'Decking', crewType: 'Formation',
  budgetedRevenue: 0, budgetedCost: 0, segments: [], subtasks: [], ...over,
})
const labourSeg = (start: string, end: string, weeks: number, hours: number) =>
  ({ id: `${start}-${hours}`, startDate: start, endDate: end, weekCount: weeks, revenueAllocation: 1, costAllocation: 0, labourHours: hours })

describe('computeCrewLoad', () => {
  // Two-week labour bar Mon 3 Aug - Fri 14 Aug, 80 hours total.
  const entries = [entry({ subtasks: [
    { id: 'lab', label: 'Labour', costType: 'labour', segments: [labourSeg('2026-08-03', '2026-08-14', 2, 80)] },
    { id: 'mat', label: 'Materials', costType: 'material', segments: [labourSeg('2026-08-03', '2026-08-07', 1, 999)] },
  ] })]

  it('spreads labour hours across the bar weeks and ignores non-labour lines', () => {
    const w = computeCrewLoad(entries, 2, '2026-08-03', 3)
    expect(w[0].scheduledHours).toBeCloseTo(40)
    expect(w[1].scheduledHours).toBeCloseTo(40)
    expect(w[2].scheduledHours).toBe(0)
  })

  it('load % against crewSize x 40h', () => {
    const w = computeCrewLoad(entries, 2, '2026-08-03', 1)
    expect(w[0].capacityHours).toBe(80)
    expect(w[0].loadPct).toBe(50)
  })

  it('null load when crew size unknown', () => {
    expect(computeCrewLoad(entries, 0, '2026-08-03', 1)[0].loadPct).toBeNull()
  })
})
