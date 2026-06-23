import { describe, it, expect } from 'vitest'
import type { GanttSubtask } from '@/types'
import { mapSubtaskTree, findSubtaskInTree, removeSubtaskFromTree, addChildSubtask, flattenSubtasks } from './ganttSubtasks'

// A small two-level tree: a → (a1 → a1a), b
const tree = (): GanttSubtask[] => [
  { id: 'a', label: 'A', segments: [], subtasks: [
    { id: 'a1', label: 'A1', segments: [], subtasks: [
      { id: 'a1a', label: 'A1a', segments: [] },
    ] },
  ] },
  { id: 'b', label: 'B', segments: [] },
]

describe('findSubtaskInTree', () => {
  it('finds nodes at any depth', () => {
    expect(findSubtaskInTree(tree(), 'a')?.label).toBe('A')
    expect(findSubtaskInTree(tree(), 'a1')?.label).toBe('A1')
    expect(findSubtaskInTree(tree(), 'a1a')?.label).toBe('A1a')
    expect(findSubtaskInTree(tree(), 'b')?.label).toBe('B')
  })
  it('returns undefined for a missing id', () => {
    expect(findSubtaskInTree(tree(), 'nope')).toBeUndefined()
    expect(findSubtaskInTree([], 'a')).toBeUndefined()
  })
})

describe('mapSubtaskTree', () => {
  it('updates a deeply nested node and leaves siblings/ancestors intact', () => {
    const out = mapSubtaskTree(tree(), 'a1a', st => ({ ...st, label: 'renamed' }))
    expect(findSubtaskInTree(out, 'a1a')?.label).toBe('renamed')
    expect(findSubtaskInTree(out, 'a')?.label).toBe('A')   // ancestor unchanged
    expect(findSubtaskInTree(out, 'b')?.label).toBe('B')   // sibling unchanged
  })
  it('updates a flat (depth-1) list exactly like the old behaviour', () => {
    const flat: GanttSubtask[] = [{ id: 'x', label: 'X', segments: [] }, { id: 'y', label: 'Y', segments: [] }]
    const out = mapSubtaskTree(flat, 'y', st => ({ ...st, label: 'Y2' }))
    expect(out.map(s => s.label)).toEqual(['X', 'Y2'])
  })
})

describe('addChildSubtask', () => {
  it('nests a child under a node at any depth', () => {
    const child: GanttSubtask = { id: 'a1b', label: 'A1b', segments: [] }
    const out = addChildSubtask(tree(), 'a1', child)
    expect(findSubtaskInTree(out, 'a1')?.subtasks?.map(s => s.id)).toEqual(['a1a', 'a1b'])
  })
  it('adds the first child to a leaf', () => {
    const out = addChildSubtask(tree(), 'b', { id: 'b1', label: 'B1', segments: [] })
    expect(findSubtaskInTree(out, 'b')?.subtasks?.map(s => s.id)).toEqual(['b1'])
  })
})

describe('removeSubtaskFromTree', () => {
  it('removes a leaf', () => {
    const out = removeSubtaskFromTree(tree(), 'a1a')
    expect(findSubtaskInTree(out, 'a1a')).toBeUndefined()
    expect(findSubtaskInTree(out, 'a1')?.subtasks).toEqual([])
  })
  it('removes a branch along with its descendants', () => {
    const out = removeSubtaskFromTree(tree(), 'a')
    expect(findSubtaskInTree(out, 'a')).toBeUndefined()
    expect(findSubtaskInTree(out, 'a1')).toBeUndefined()    // descendant gone too
    expect(findSubtaskInTree(out, 'a1a')).toBeUndefined()
    expect(out.map(s => s.id)).toEqual(['b'])
  })
})

describe('flattenSubtasks', () => {
  it('pre-orders the tree with depth', () => {
    expect(flattenSubtasks(tree()).map(({ st, depth }) => [st.id, depth])).toEqual([
      ['a', 0], ['a1', 1], ['a1a', 2], ['b', 0],
    ])
  })
  it('finds a scheduled segment on a nested node', () => {
    const t: GanttSubtask[] = [
      { id: 'p', label: 'P', segments: [], subtasks: [
        { id: 'c', label: 'C', segments: [{ id: 's', startDate: '2026-06-19', endDate: '2026-06-19', weekCount: 1, revenueAllocation: 0, costAllocation: 0 }] },
      ] },
    ]
    expect(flattenSubtasks(t).some(({ st }) => st.segments.length > 0)).toBe(true)
  })
})
