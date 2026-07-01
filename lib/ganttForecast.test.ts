import { describe, it, expect } from 'vitest'
import type { GanttEntry } from '@/types'
import { plannedByWeek, claimLeafSegments, entrySegments, segmentWeekShare, segmentWeekShares } from './ganttForecast'

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

  it('counts a plain (untyped) subtask as a Labour claim — Andrew iter6', () => {
    const m = plannedByWeek([entry({
      subtasks: [{ id: 'rfw', label: 'Remove for works', segments: [seg('2026-08-07', '2026-08-07', 1, 5000)] }],
    })], fridays)
    expect(sum(m)).toBeCloseTo(5000)
  })

  it('drops the category bar once a nested leaf is claimed (no double-count)', () => {
    const m = plannedByWeek([entry({
      segments: [seg('2026-08-07', '2026-08-21', 3, 9000)],   // category bar
      subtasks: [{ id: 'rfw', label: 'Remove for works', segments: [seg('2026-08-07', '2026-08-07', 1, 5000)] }],
    })], fridays)
    expect(sum(m)).toBeCloseTo(5000)   // the claimed subtask, NOT 9000 + 5000
  })

  it('keeps the category bar when subtasks carry no claim', () => {
    const m = plannedByWeek([entry({
      segments: [seg('2026-08-07', '2026-08-21', 3, 9000)],
      subtasks: [{ id: 'note', label: 'note', segments: [] }],   // no claim
    })], fridays)
    expect(sum(m)).toBeCloseTo(9000)
  })
})

describe('entrySegments (single-source segment list for non-revenue readers)', () => {
  it('returns the own bar for an unsplit category', () => {
    const segs = entrySegments(entry({ segments: [seg('2026-08-07', '2026-08-21', 3, 9000, 4000)] }))
    expect(segs.map(s => s.endDate)).toEqual(['2026-08-21'])
    expect(segs.reduce((a, s) => a + s.costAllocation, 0)).toBe(4000)
  })

  it('returns the split type-line bars (NOT the empty own segments) for a split category', () => {
    // The master-programme / foreman / actuals bug: a split category clears its own segments, so reading
    // entry.segments alone is empty. entrySegments must surface the type-line leaves instead.
    const segs = entrySegments(entry({
      segments: [],
      subtasks: [
        { id: 'lab', label: 'Labour', costType: 'labour', segments: [seg('2026-08-07', '2026-08-14', 2, 6000, 3000)] },
        { id: 'mat', label: 'Materials', costType: 'material', segments: [seg('2026-08-14', '2026-08-21', 2, 4000, 2500)] },
      ],
    }))
    expect(segs.map(s => s.endDate).sort()).toEqual(['2026-08-14', '2026-08-21'])
    expect(segs.reduce((a, s) => a + s.costAllocation, 0)).toBe(5500)
  })

  it('is empty when a split category has no scheduled bars yet', () => {
    expect(entrySegments(entry({
      segments: [],
      subtasks: [{ id: 'lab', label: 'Labour', costType: 'labour', segments: [] }],
    }))).toEqual([])
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

  it('treats an untyped leaf as a Labour claim (iter6)', () => {
    const leaves = claimLeafSegments([{ id: 'n', label: 'Remove for works', segments: [seg('2026-08-07', '2026-08-07', 1, 5000)] }])
    expect(leaves.map(l => [l.costType, l.seg.revenueAllocation])).toEqual([['labour', 5000]])
  })
})

// Reference: 2026-07-31 and 2026-08-07 are Fridays; 2026-07-30 = Thu, 2026-08-03 = Mon.
describe('segmentWeekShare / segmentWeekShares (week-straddle distribution)', () => {
  // 3-day days-view bar: Thu 07-30 + Fri 07-31 (week ending 07-31) then Mon 08-03 (week ending 08-07).
  const daysBar = { id: 'd', startDate: '2026-07-30', endDate: '2026-08-03', weekCount: 1, grain: 'days' as const, revenueAllocation: 900, costAllocation: 300 }

  it('splits a days bar proportionally: 2/3 in the first week, 1/3 in the next', () => {
    expect(segmentWeekShare(daysBar, '2026-07-27', '2026-07-31')).toBeCloseTo(2 / 3, 6)
    expect(segmentWeekShare(daysBar, '2026-08-03', '2026-08-07')).toBeCloseTo(1 / 3, 6)
  })
  it('does not double-count: the week shares sum to 1', () => {
    const total = segmentWeekShares(daysBar).reduce((a, b) => a + b.fraction, 0)
    expect(total).toBeCloseTo(1, 6)
    expect(segmentWeekShares(daysBar).map(s => s.friIso)).toEqual(['2026-07-31', '2026-08-07'])
  })
  it('a weeks-view (grain-absent) bar still splits equally per week', () => {
    const weeksBar = { id: 'w', startDate: '2026-07-31', endDate: '2026-08-07', weekCount: 2, revenueAllocation: 1000, costAllocation: 0 }
    expect(segmentWeekShare(weeksBar, '2026-07-27', '2026-07-31')).toBeCloseTo(0.5, 6)
    expect(segmentWeekShare(weeksBar, '2026-08-03', '2026-08-07')).toBeCloseTo(0.5, 6)
  })
  it('plannedByWeek distributes a straddling days bar proportionally', () => {
    const fri = ['2026-07-31', '2026-08-07'].map(d => new Date(`${d}T00:00:00`))
    const m = plannedByWeek([entry({ segments: [daysBar] })], fri)
    expect(m.get('2026-07-31')?.rev).toBeCloseTo(600, 4)   // 2/3 of 900
    expect(m.get('2026-08-07')?.rev).toBeCloseTo(300, 4)   // 1/3 of 900
    expect(m.get('2026-07-31')?.cost).toBeCloseTo(200, 4)  // 2/3 of 300
  })

  // 2026-06-05 = Fri, 2026-06-08 = Mon (King's Birthday, a VIC public holiday), 2026-06-09 = Tue.
  it('skips public holidays in the day split, not just weekends', () => {
    // Bar Fri 06-05 -> Tue 06-09. Week ending 06-05: Fri = 1 chart day. Week ending 06-12: Mon 08 is a
    // public holiday (skipped), so only Tue 09 = 1 chart day. => 1/2 + 1/2 (would be 1/3 + 2/3 if the
    // holiday counted).
    const holBar = { id: 'h', startDate: '2026-06-05', endDate: '2026-06-09', weekCount: 1, grain: 'days' as const, revenueAllocation: 800, costAllocation: 0 }
    expect(segmentWeekShare(holBar, '2026-06-01', '2026-06-05')).toBeCloseTo(0.5, 6)
    expect(segmentWeekShare(holBar, '2026-06-08', '2026-06-12')).toBeCloseTo(0.5, 6)
  })
})
