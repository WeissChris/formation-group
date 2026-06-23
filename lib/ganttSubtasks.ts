import type { GanttSubtask } from '@/types'

// ── Subtask tree helpers ──────────────────────────────────────────────────────
// A gantt sub-task can nest child sub-tasks to any depth. Every sub-task id is unique within an entry, so
// the schedule handlers keep targeting by a single id — these walk the whole tree to find / update /
// remove / add it. A flat list is just a depth-1 tree, so existing (non-nested) schedules behave
// identically. Sub-task segments carry no budget and are absent from the forecast — nesting is a visual
// scheduling aid only.

/** Apply `updater` to the sub-task with `id` anywhere in the tree, leaving the rest unchanged. */
export function mapSubtaskTree(subtasks: GanttSubtask[], id: string, updater: (st: GanttSubtask) => GanttSubtask): GanttSubtask[] {
  return subtasks.map(st => {
    if (st.id === id) return updater(st)
    if (st.subtasks?.length) return { ...st, subtasks: mapSubtaskTree(st.subtasks, id, updater) }
    return st
  })
}

/** Find the sub-task with `id` anywhere in the tree. */
export function findSubtaskInTree(subtasks: GanttSubtask[], id: string): GanttSubtask | undefined {
  for (const st of subtasks) {
    if (st.id === id) return st
    const found = st.subtasks?.length ? findSubtaskInTree(st.subtasks, id) : undefined
    if (found) return found
  }
  return undefined
}

/** Remove the sub-task with `id` (and, since they're nested inside it, its descendants) from the tree. */
export function removeSubtaskFromTree(subtasks: GanttSubtask[], id: string): GanttSubtask[] {
  return subtasks.filter(st => st.id !== id).map(st => st.subtasks?.length ? { ...st, subtasks: removeSubtaskFromTree(st.subtasks, id) } : st)
}

/** Append `child` to the sub-task `parentId`'s children, anywhere in the tree. */
export function addChildSubtask(subtasks: GanttSubtask[], parentId: string, child: GanttSubtask): GanttSubtask[] {
  return subtasks.map(st => {
    if (st.id === parentId) return { ...st, subtasks: [...(st.subtasks ?? []), child] }
    if (st.subtasks?.length) return { ...st, subtasks: addChildSubtask(st.subtasks, parentId, child) }
    return st
  })
}

/** Pre-order flatten with depth, for indented rendering + "is anything scheduled" checks across the tree. */
export function flattenSubtasks(subtasks: GanttSubtask[], depth = 0): { st: GanttSubtask; depth: number }[] {
  const out: { st: GanttSubtask; depth: number }[] = []
  for (const st of subtasks) {
    out.push({ st, depth })
    if (st.subtasks?.length) out.push(...flattenSubtasks(st.subtasks, depth + 1))
  }
  return out
}
