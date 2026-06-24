import type { GanttEntry } from '@/types'
import { toISODate } from '@/lib/utils'
import { flattenSubtasks } from '@/lib/ganttSubtasks'

// Planned revenue + cost per week (keyed by the week's Friday ISO) for a set of gantt entries. A segment
// contributes revenueAllocation/weekCount to every week it overlaps (Mon–Fri of that week), so it works in
// both weeks and days view and against a baseline snapshot. Used for the fortnightly cycle + invoice totals.
//
// CRITICAL: this includes the auto-split Materials/Labour/Subcontractor LINES (costType subtasks). A split
// category's own segments are cleared, so its claims live entirely on those lines — if this reader ignored
// them, split categories would contribute $0 to the cash-flow + invoice totals (the Andrew iter4 bug).
// Manual (non-costType) subtasks carry no budget and are excluded.
export function plannedByWeek(entries: GanttEntry[], fridays: Date[]): Map<string, { rev: number; cost: number }> {
  const map = new Map<string, { rev: number; cost: number }>()
  for (const f of fridays) {
    const friIso = toISODate(f)
    const mon = new Date(f); mon.setDate(mon.getDate() - 4)
    const monIso = toISODate(mon)
    let rev = 0, cost = 0
    for (const e of entries) {
      const segs = [
        ...e.segments,
        ...flattenSubtasks(e.subtasks ?? []).filter(({ st }) => st.costType).flatMap(({ st }) => st.segments),
      ]
      for (const seg of segs) {
        if (seg.startDate && seg.endDate && seg.weekCount > 0 && seg.startDate <= friIso && seg.endDate >= monIso) {
          rev += seg.revenueAllocation / seg.weekCount
          cost += seg.costAllocation / seg.weekCount
        }
      }
    }
    map.set(friIso, { rev, cost })
  }
  return map
}
