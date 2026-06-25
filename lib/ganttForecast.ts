import type { GanttEntry, GanttSubtask, GanttSegment } from '@/types'
import { toISODate } from '@/lib/utils'

export type CostTypeKey = 'labour' | 'material' | 'subcontractor' | 'equipment'

// ── Leaf-claim roll-up (Andrew iter5) ─────────────────────────────────────────
// Claims live on LEAF nodes; a node with children is a pure roll-up of them, so a parent never double-counts
// its descendants and a value entered on a deeply-nested item flows up cleanly (like the LIVE REVENUE sheet,
// where every micro-input aggregates into its parent + the weekly columns). A nested item inherits its
// parent's costType at creation, so every claim leaf knows its discipline. Manual (no-costType) leaves carry
// no budget and are skipped.
export function claimLeafSegments(subtasks: GanttSubtask[], parentLabel = ''): { costType: CostTypeKey; seg: GanttSegment; label: string }[] {
  const out: { costType: CostTypeKey; seg: GanttSegment; label: string }[] = []
  for (const node of subtasks) {
    const label = node.label || parentLabel
    if (node.subtasks?.length) {
      out.push(...claimLeafSegments(node.subtasks, label))   // branch → roll up its leaves, skip own segs
    } else if (node.costType) {
      for (const seg of node.segments) out.push({ costType: node.costType, seg, label })
    }
  }
  return out
}

// Every revenue-bearing segment of an entry: its own (unsplit-category) segments plus the leaf claims from
// the subtask tree. The single source of truth for all forecast readers, so the cash-flow strip, the
// fortnight/invoice totals and the persisted forecast can never disagree (the iter4/iter5 bug class).
export function entryClaimSegments(entry: GanttEntry): { costType?: CostTypeKey; seg: GanttSegment; label: string }[] {
  const own = entry.segments.map(seg => ({ seg, label: seg.label ?? '' }))
  return [...own, ...claimLeafSegments(entry.subtasks ?? [])]
}

// Planned revenue + cost per week (keyed by the week's Friday ISO). A segment contributes
// revenueAllocation/weekCount to every week it overlaps (Mon–Fri of that week), so it works in both weeks
// and days view and against a baseline snapshot. Used for the fortnightly cycle + inline invoice totals.
export function plannedByWeek(entries: GanttEntry[], fridays: Date[]): Map<string, { rev: number; cost: number }> {
  const map = new Map<string, { rev: number; cost: number }>()
  for (const f of fridays) {
    const friIso = toISODate(f)
    const mon = new Date(f); mon.setDate(mon.getDate() - 4)
    const monIso = toISODate(mon)
    let rev = 0, cost = 0
    for (const e of entries) {
      for (const { seg } of entryClaimSegments(e)) {
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
