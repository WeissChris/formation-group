import { describe, it, expect } from 'vitest'
import type { GanttEntry, GanttSegment, GanttSubtask } from '@/types'
import { dedupeGanttEntries } from './ganttDedupe'

const seg = (id: string, dated = true): GanttSegment => ({
  id,
  startDate: dated ? '2026-06-19' : '',
  endDate: dated ? '2026-06-26' : '',
  weekCount: 1,
  revenueAllocation: 0,
  costAllocation: 0,
})

const entry = (id: string, category: string, over: Partial<GanttEntry> = {}): GanttEntry => ({
  id,
  projectId: 'p1',
  estimateId: 'est1',
  category,
  crewType: 'Formation',
  budgetedRevenue: 13593,
  budgetedCost: 10000,
  segments: [],
  subtasks: [],
  ...over,
})

const typeLine = (id: string, costType: GanttSubtask['costType'], segments: GanttSegment[] = []): GanttSubtask =>
  ({ id, label: costType === 'material' ? 'Materials' : 'Labour', segments, costType })

describe('dedupeGanttEntries', () => {
  it('returns the same array when no category is duplicated (fast path)', () => {
    const list = [entry('a', 'Paving'), entry('b', 'Decking')]
    expect(dedupeGanttEntries(list)).toBe(list)
  })

  it('keeps the dated row when only one duplicate has dated segments (own bar)', () => {
    const winner = entry('a', 'Outdoor kitchen', { segments: [seg('s1')] })
    const loser = entry('b', 'Outdoor kitchen', { subtasks: [typeLine('t1', 'material'), typeLine('t2', 'labour')] })
    expect(dedupeGanttEntries([loser, winner])).toEqual([winner])
  })

  it('finds dated work on a nested subtask leaf, not just the own bar', () => {
    const winner = entry('a', 'Outdoor kitchen', {
      subtasks: [{ id: 't1', label: 'Labour', costType: 'labour', segments: [], subtasks: [
        { id: 't1a', label: 'Benchtops', segments: [seg('s1')] },
      ] }],
    })
    const loser = entry('b', 'Outdoor kitchen', { subtasks: [typeLine('t2', 'material'), typeLine('t3', 'labour'), typeLine('t4', 'subcontractor'), typeLine('t5', 'equipment')] })
    expect(dedupeGanttEntries([winner, loser])).toEqual([winner])
  })

  it('merges own segments + subtask trees when both duplicates carry dated work', () => {
    const a = entry('a', 'Outdoor kitchen', { segments: [seg('s1')], subtasks: [typeLine('t1', 'labour', [seg('s2')])] })
    const b = entry('b', 'Outdoor kitchen', { segments: [seg('s3')], subtasks: [typeLine('t2', 'material', [seg('s4')])] })
    const out = dedupeGanttEntries([a, b])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('a')   // first dated row is the surviving id
    expect(out[0].segments.map(s => s.id)).toEqual(['s1', 's3'])
    expect((out[0].subtasks ?? []).map(t => t.id)).toEqual(['t1', 't2'])
  })

  it('keeps the row with the larger subtask tree when neither has dated work', () => {
    const small = entry('a', 'Outdoor kitchen', { subtasks: [typeLine('t1', 'labour')] })
    const big = entry('b', 'Outdoor kitchen', { subtasks: [typeLine('t2', 'material'), typeLine('t3', 'labour'), typeLine('t4', 'subcontractor'), typeLine('t5', 'equipment')] })
    expect(dedupeGanttEntries([small, big])).toEqual([big])
  })

  it('preserves first-occurrence order and leaves other categories untouched', () => {
    const paving = entry('a', 'Paving', { segments: [seg('s1')] })
    const dupe1 = entry('b', 'Outdoor kitchen', { subtasks: [typeLine('t1', 'labour')] })
    const decking = entry('c', 'Decking', { segments: [seg('s2')] })
    const dupe2 = entry('d', 'Outdoor kitchen', { subtasks: [typeLine('t2', 'material', [seg('s3')])] })
    const out = dedupeGanttEntries([paving, dupe1, decking, dupe2])
    expect(out.map(e => e.id)).toEqual(['a', 'd', 'c'])   // winner sits at the dupe's first position
  })

  it('does not collapse the same category across different projects', () => {
    const p1 = entry('a', 'Outdoor kitchen')
    const p2 = entry('b', 'Outdoor kitchen', { projectId: 'p2' })
    const list = [p1, p2]
    expect(dedupeGanttEntries(list)).toBe(list)   // different projects → no duplicates → fast path
  })

  it('collapses three-way duplicates: dated winner beats two undated rows', () => {
    const w = entry('a', 'Outdoor kitchen', { segments: [seg('s1')] })
    const l1 = entry('b', 'Outdoor kitchen', { subtasks: [typeLine('t1', 'labour')] })
    const l2 = entry('c', 'Outdoor kitchen', { subtasks: [typeLine('t2', 'material')] })
    expect(dedupeGanttEntries([l1, w, l2])).toEqual([w])
  })
})
