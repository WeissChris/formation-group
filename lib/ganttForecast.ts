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
    } else {
      // EVERY nested leaf is claimable (Andrew iter6): one with no discipline defaults to a Labour/hours
      // claim, so a plain subtask added straight under a category can be claimed in hours and still counts.
      const costType = node.costType ?? 'labour'
      for (const seg of node.segments) out.push({ costType, seg, label })
    }
  }
  return out
}

// Every revenue-bearing segment of an entry: the leaf claims from the subtask tree, plus the category's own
// (unsplit) bar — but the own bar is dropped once any nested leaf actually carries a claim, so a parent is a
// pure roll-up of its claimed children and never double-counts (single source of truth for all readers).
export function entryClaimSegments(entry: GanttEntry): { costType?: CostTypeKey; seg: GanttSegment; label: string }[] {
  const leaves = claimLeafSegments(entry.subtasks ?? [])
  const leafClaimed = leaves.some(l => l.seg.startDate && l.seg.endDate && (l.seg.revenueAllocation || 0) > 0)
  const own = leafClaimed ? [] : entry.segments.map(seg => ({ seg, label: seg.label ?? '' }))
  return [...own, ...leaves]
}

// Every dated/costed segment an entry contributes to a schedule, from the single source: the category's
// own bar PLUS its split type-line / subtask leaves. Read this (NOT entry.segments) anywhere outside the
// Gantt editor that needs an entry's bars, dates or cost — a split category clears its own segments, so
// reading entry.segments alone makes it look empty (the "split project shows no bars / no work" bug on
// the master programme, foreman portal, actuals and project health). Same single-source rule as the
// revenue readers, for non-revenue consumers.
export function entrySegments(entry: GanttEntry): GanttSegment[] {
  return entryClaimSegments(entry).map(c => c.seg)
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
