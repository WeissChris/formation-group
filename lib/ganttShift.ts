// Shifting a whole schedule sideways.
//
// The gantt already lets you drag ONE category's roll-up bar to slide that category. When the job
// itself is pushed back - client not ready, wet weather, a permit late - every category has to move
// by the same amount. These helpers back the project bar that does that in one drag, and they are
// pure so the maths can be tested without the 3,000-line editor component.
//
// Everything is COLUMN based, like the rest of the gantt: an offset of N means N grid columns, and
// in Days view a column is a working day, so a shift skips weekends for free.

import type { GanttEntry, GanttSegment, GanttSubtask } from '@/types'

/** One dated bar, snapshotted at the start of a drag so the shift is always from the original. */
export interface ShiftSnapshotSeg {
  segId: string
  start: string
  end: string
}

export interface ShiftSnapshot {
  segs: ShiftSnapshotSeg[]
  spanStart: string
  spanEnd: string
}

/** Walk an entry's own bars plus every (nested) subtask leaf, dated ones only. */
export function datedSegmentsOf(entry: GanttEntry): ShiftSnapshotSeg[] {
  const out: ShiftSnapshotSeg[] = []
  const push = (s: GanttSegment) => {
    if (s.startDate && s.endDate) out.push({ segId: s.id, start: s.startDate, end: s.endDate })
  }
  for (const s of entry.segments) push(s)
  const walk = (sts: GanttSubtask[]) => {
    for (const st of sts) {
      for (const s of st.segments) push(s)
      if (st.subtasks?.length) walk(st.subtasks)
    }
  }
  walk(entry.subtasks ?? [])
  return out
}

/**
 * Snapshot every dated bar across every entry, with the overall span. Null when nothing is
 * scheduled yet - there is no project bar to drag in that case.
 */
export function projectSnapshot(entries: GanttEntry[]): ShiftSnapshot | null {
  const segs = entries.flatMap(datedSegmentsOf)
  if (segs.length === 0) return null
  const spanStart = segs.map(s => s.start).sort()[0]
  const spanEnd = segs.map(s => s.end).sort().slice(-1)[0]
  return { segs, spanStart, spanEnd }
}

/**
 * Clamp a drag offset so the whole job stays inside the rendered window, keeping its length.
 * Clamping each end separately would squash the schedule against an edge.
 * An off-window span (index -1) is left unclamped - the caller falls back to per-end clamping.
 */
export function clampOffset(spanStartIdx: number, spanEndIdx: number, offset: number, colCount: number): number {
  if (spanStartIdx < 0 || spanEndIdx < 0) return offset
  return Math.max(-spanStartIdx, Math.min(colCount - 1 - spanEndIdx, offset))
}

/**
 * Apply a map of segment id -> new dates across every entry, recursing into nested subtasks.
 * Segments not in the map are returned untouched (same object), so React can skip them.
 */
export function applyShift(entries: GanttEntry[], moved: Map<string, { start: string; end: string }>): GanttEntry[] {
  if (moved.size === 0) return entries
  const shiftSeg = (s: GanttSegment): GanttSegment => {
    const n = moved.get(s.id)
    return n ? { ...s, startDate: n.start, endDate: n.end } : s
  }
  const walk = (sts: GanttSubtask[]): GanttSubtask[] =>
    sts.map(st => ({
      ...st,
      segments: st.segments.map(shiftSeg),
      ...(st.subtasks?.length ? { subtasks: walk(st.subtasks) } : {}),
    }))
  return entries.map(e => ({
    ...e,
    segments: e.segments.map(shiftSeg),
    ...(e.subtasks?.length ? { subtasks: walk(e.subtasks) } : {}),
  }))
}

/**
 * Turn a snapshot + a clamped column offset into the id -> new dates map, using the caller's
 * column<->date functions (which differ between Days and Weeks view).
 */
export function shiftMap(
  snapshot: ShiftSnapshot,
  clamped: number,
  colIndexForDate: (iso: string) => number,
  dateForColIdx: (idx: number) => string,
): Map<string, { start: string; end: string }> {
  const out = new Map<string, { start: string; end: string }>()
  if (clamped === 0) return out
  for (const sg of snapshot.segs) {
    const si = colIndexForDate(sg.start), ei = colIndexForDate(sg.end)
    if (si < 0 || ei < 0) continue          // off-window bars are left where they are
    out.set(sg.segId, { start: dateForColIdx(si + clamped), end: dateForColIdx(ei + clamped) })
  }
  return out
}
