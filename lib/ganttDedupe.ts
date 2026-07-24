import type { GanttEntry, GanttSegment } from '@/types'
import { flattenSubtasks } from '@/lib/ganttSubtasks'

// ── Duplicate-category collapse ───────────────────────────────────────────────
// Residue of the pre-liveSync era (the 2026-06-30 sync incident): two machines could each create a
// gantt row for the same project+category (different ids) and both survive in localStorage + Supabase.
// The editor only ever renders the FIRST match (entries.find by category) but syncForecast and every
// forecast total iterate ALL entries, so the duplicated category double-counts its revenue. Deleting
// the remote row alone doesn't stick - a machine still holding both re-pushes them on its next save -
// so the gantt page runs this on every load instead: the next Save persists the collapsed set and
// upsertGanttEntries prunes the losing ids from Supabase, which deletes them everywhere.

function hasDatedSegments(e: GanttEntry): boolean {
  const dated = (segs: GanttSegment[]) => segs.some(s => !!s.startDate && !!s.endDate)
  return dated(e.segments) || flattenSubtasks(e.subtasks ?? []).some(({ st }) => dated(st.segments))
}

const subtaskCount = (e: GanttEntry) => flattenSubtasks(e.subtasks ?? []).length

/**
 * Collapse entries sharing a project+category to one row. The row with dated work anywhere in its tree
 * (own bar or any subtask) wins; if SEVERAL rows carry dated work, their own segments + subtask trees
 * concat onto the first (segment/subtask ids are unique across rows, so the schedule handlers keep
 * targeting correctly) - nothing drawn is ever dropped; with no dated work anywhere keep the row with
 * the larger subtask tree. First-occurrence order is preserved. No duplicates → the same array back.
 */
export function dedupeGanttEntries(entries: GanttEntry[]): GanttEntry[] {
  const groups = new Map<string, GanttEntry[]>()
  for (const e of entries) {
    const key = `${e.projectId}|${e.category}`
    const g = groups.get(key)
    if (g) g.push(e); else groups.set(key, [e])
  }
  if (groups.size === entries.length) return entries   // fast path - no duplicates
  const out: GanttEntry[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    const key = `${e.projectId}|${e.category}`
    if (seen.has(key)) continue
    seen.add(key)
    const group = groups.get(key)!
    if (group.length === 1) { out.push(e); continue }
    const dated = group.filter(hasDatedSegments)
    if (dated.length === 1) { out.push(dated[0]); continue }
    if (dated.length === 0) { out.push(group.reduce((a, b) => subtaskCount(b) > subtaskCount(a) ? b : a)); continue }
    const [base, ...rest] = dated
    out.push({
      ...base,
      segments: [...base.segments, ...rest.flatMap(r => r.segments)],
      subtasks: [...(base.subtasks ?? []), ...rest.flatMap(r => r.subtasks ?? [])],
    })
  }
  return out
}
