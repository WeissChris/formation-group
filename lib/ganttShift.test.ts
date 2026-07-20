import { describe, it, expect } from 'vitest'
import { datedSegmentsOf, projectSnapshot, clampOffset, applyShift, shiftMap } from './ganttShift'
import type { GanttEntry, GanttSegment } from '@/types'

const seg = (id: string, start: string, end: string): GanttSegment => ({
  id, startDate: start, endDate: end, weekCount: 1, revenueAllocation: 0, costAllocation: 0,
})

const entry = (over: Partial<GanttEntry> = {}): GanttEntry => ({
  id: 'e1', projectId: 'p1', estimateId: 'est1', category: 'Paving', crewType: 'Formation',
  budgetedRevenue: 0, budgetedCost: 0, segments: [], subtasks: [], ...over,
})

/** A split category: no own bars, work lives on M/L/S type lines, one with a nested subtask. */
const splitEntry = entry({
  id: 'e2', category: 'Concrete', segments: [],
  subtasks: [
    { id: 'st1', label: 'Materials', costType: 'material', segments: [seg('s2', '2026-08-05', '2026-08-06')] },
    {
      id: 'st2', label: 'Labour', costType: 'labour', segments: [seg('s3', '2026-08-07', '2026-08-10')],
      subtasks: [{ id: 'st3', label: 'Finish', segments: [seg('s4', '2026-08-11', '2026-08-12')] }],
    },
  ],
})

describe('datedSegmentsOf', () => {
  it('collects own bars, type lines and nested subtasks', () => {
    expect(datedSegmentsOf(splitEntry).map(s => s.segId)).toEqual(['s2', 's3', 's4'])
  })
  it('skips undated bars', () => {
    const e = entry({ segments: [seg('a', '2026-08-01', '2026-08-02'), { ...seg('b', '', ''), startDate: '', endDate: '' }] })
    expect(datedSegmentsOf(e).map(s => s.segId)).toEqual(['a'])
  })
})

describe('projectSnapshot', () => {
  it('spans the earliest start to the latest end across every entry', () => {
    const snap = projectSnapshot([entry({ segments: [seg('s1', '2026-08-01', '2026-08-04')] }), splitEntry])!
    expect(snap.spanStart).toBe('2026-08-01')
    expect(snap.spanEnd).toBe('2026-08-12')
    expect(snap.segs).toHaveLength(4)
  })
  it('is null when nothing is scheduled', () => {
    expect(projectSnapshot([entry()])).toBeNull()
    expect(projectSnapshot([])).toBeNull()
  })
})

describe('clampOffset', () => {
  const COLS = 100
  it('passes a shift through when there is room', () => {
    expect(clampOffset(10, 20, 5, COLS)).toBe(5)
    expect(clampOffset(10, 20, -5, COLS)).toBe(-5)
  })
  it('stops the span running off the left edge, keeping its length', () => {
    expect(clampOffset(10, 20, -50, COLS)).toBe(-10)
  })
  it('stops the span running off the right edge, keeping its length', () => {
    expect(clampOffset(10, 20, 500, COLS)).toBe(COLS - 1 - 20)
  })
  it('leaves an off-window span alone for the caller to handle', () => {
    expect(clampOffset(-1, 20, 7, COLS)).toBe(7)
    expect(clampOffset(10, -1, 7, COLS)).toBe(7)
  })
})

describe('shiftMap + applyShift', () => {
  // A trivial column model: one column per day from 2026-08-01.
  const day0 = Date.parse('2026-08-01T00:00:00Z')
  const colIndexForDate = (iso: string) => Math.round((Date.parse(iso + 'T00:00:00Z') - day0) / 86400000)
  const dateForColIdx = (i: number) => new Date(day0 + i * 86400000).toISOString().slice(0, 10)

  const entries = [entry({ segments: [seg('s1', '2026-08-01', '2026-08-04')] }), splitEntry]

  it('moves every bar - own, type line and nested - by the same offset', () => {
    const snap = projectSnapshot(entries)!
    const moved = applyShift(entries, shiftMap(snap, 3, colIndexForDate, dateForColIdx))
    expect(moved[0].segments[0]).toMatchObject({ startDate: '2026-08-04', endDate: '2026-08-07' })
    expect(moved[1].subtasks![0].segments[0]).toMatchObject({ startDate: '2026-08-08', endDate: '2026-08-09' })
    expect(moved[1].subtasks![1].segments[0]).toMatchObject({ startDate: '2026-08-10', endDate: '2026-08-13' })
    expect(moved[1].subtasks![1].subtasks![0].segments[0]).toMatchObject({ startDate: '2026-08-14', endDate: '2026-08-15' })
  })

  it('preserves every bar length and the gaps between them', () => {
    const snap = projectSnapshot(entries)!
    const moved = applyShift(entries, shiftMap(snap, -1, colIndexForDate, dateForColIdx))
    const after = projectSnapshot(moved)!
    expect(colIndexForDate(after.spanEnd) - colIndexForDate(after.spanStart))
      .toBe(colIndexForDate(snap.spanEnd) - colIndexForDate(snap.spanStart))
    expect(after.spanStart).toBe('2026-07-31')
  })

  it('is a no-op at zero offset and leaves the originals untouched', () => {
    const snap = projectSnapshot(entries)!
    const map = shiftMap(snap, 0, colIndexForDate, dateForColIdx)
    expect(map.size).toBe(0)
    expect(applyShift(entries, map)).toBe(entries)
    expect(entries[0].segments[0].startDate).toBe('2026-08-01')
  })

  it('does not mutate the input entries', () => {
    const snap = projectSnapshot(entries)!
    applyShift(entries, shiftMap(snap, 5, colIndexForDate, dateForColIdx))
    expect(entries[0].segments[0].startDate).toBe('2026-08-01')
    expect(splitEntry.subtasks![1].subtasks![0].segments[0].startDate).toBe('2026-08-11')
  })

  it('leaves bars outside the rendered window where they are', () => {
    const snap = { segs: [{ segId: 's1', start: '2020-01-01', end: '2020-01-02' }], spanStart: '2020-01-01', spanEnd: '2020-01-02' }
    // colIndexForDate returns a negative index for these, so nothing is mapped.
    const map = shiftMap(snap, 3, iso => (iso.startsWith('2020') ? -1 : colIndexForDate(iso)), dateForColIdx)
    expect(map.size).toBe(0)
  })
})
