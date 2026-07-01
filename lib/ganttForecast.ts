import type { GanttEntry, GanttSubtask, GanttSegment } from '@/types'
import { toISODate, snapToFriday } from '@/lib/utils'
import { workingDaysBetween } from '@/lib/ganttSchedule'

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

/**
 * The fraction of a segment's allocation that belongs to the week [monIso..friIso] (0 if it doesn't
 * overlap). A DAYS-view bar splits by the working days that fall in each week, so a bar straddling a week
 * boundary distributes proportionally (e.g. a 3-day bar = 2/3 in the first week, 1/3 in the next) instead
 * of dumping the whole amount into both weeks. A WEEKS-view (or legacy, grain-absent) bar is stored
 * Friday-to-Friday and splits equally across its weekCount weeks — the same result the old code gave.
 */
export function segmentWeekShare(seg: GanttSegment, monIso: string, friIso: string): number {
  if (!seg.startDate || !seg.endDate || seg.weekCount <= 0) return 0
  if (!(seg.startDate <= friIso && seg.endDate >= monIso)) return 0   // no overlap with this week
  if (seg.grain !== 'days') return 1 / seg.weekCount
  const total = workingDaysBetween(seg.startDate, seg.endDate)
  if (total <= 0) return 1 / seg.weekCount   // all-weekend/holiday span — fall back to equal
  const s = seg.startDate > monIso ? seg.startDate : monIso
  const e = seg.endDate < friIso ? seg.endDate : friIso
  return s <= e ? workingDaysBetween(s, e) / total : 0
}

/** Enumerate the weeks a segment touches with each week's share (fractions sum to 1). Used where the weeks
 *  aren't already being iterated (the persisted forecast). Mirrors segmentWeekShare's day-vs-week split. */
export function segmentWeekShares(seg: GanttSegment): { friIso: string; fraction: number }[] {
  if (!seg.startDate || !seg.endDate || seg.weekCount <= 0) return []
  const out: { friIso: string; fraction: number }[] = []
  if (seg.grain !== 'days') {
    const start = new Date(`${seg.startDate}T00:00:00`)
    for (let w = 0; w < seg.weekCount; w++) {
      const d = new Date(start); d.setDate(d.getDate() + w * 7)
      out.push({ friIso: toISODate(snapToFriday(d)), fraction: 1 / seg.weekCount })
    }
    return out
  }
  const endFri = snapToFriday(new Date(`${seg.endDate}T00:00:00`))
  const cur = snapToFriday(new Date(`${seg.startDate}T00:00:00`))
  while (cur <= endFri) {
    const friIso = toISODate(cur)
    const monIso = toISODate(new Date(cur.getTime() - 4 * 86400000))
    const share = segmentWeekShare(seg, monIso, friIso)
    if (share > 0) out.push({ friIso, fraction: share })
    cur.setDate(cur.getDate() + 7)
  }
  if (out.length === 0) out.push({ friIso: toISODate(snapToFriday(new Date(`${seg.startDate}T00:00:00`))), fraction: 1 })
  return out
}

// Planned revenue + cost per week (keyed by the week's Friday ISO). Each segment contributes its
// per-week SHARE (proportional to working days for a straddling days bar; equal per week for a weeks bar),
// so it works in both views and against a baseline snapshot. Fortnightly cycle + inline invoice totals.
export function plannedByWeek(entries: GanttEntry[], fridays: Date[]): Map<string, { rev: number; cost: number }> {
  const map = new Map<string, { rev: number; cost: number }>()
  for (const f of fridays) {
    const friIso = toISODate(f)
    const mon = new Date(f); mon.setDate(mon.getDate() - 4)
    const monIso = toISODate(mon)
    let rev = 0, cost = 0
    for (const e of entries) {
      for (const { seg } of entryClaimSegments(e)) {
        const share = segmentWeekShare(seg, monIso, friIso)
        if (share > 0) {
          rev += seg.revenueAllocation * share
          cost += seg.costAllocation * share
        }
      }
    }
    map.set(friIso, { rev, cost })
  }
  return map
}
