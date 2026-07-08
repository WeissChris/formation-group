// Progress snapshots: a per-project time series of where timeline / cost / labour stood at each
// invoice (plus a safety-net cadence), each measured against the frozen ORIGINAL baseline. The point
// is to expose CREEP - is the forecast finish drifting away from the plan, and how fast. Snapshots
// are append-only; we never move the original reference, or the drift would hide itself.

export type SnapshotTrigger = 'invoice' | 'auto' | 'active'

export interface ProgressSnapshot {
  id: string
  capturedAt: string          // ISO timestamp
  trigger: SnapshotTrigger
  forecastEnd: string         // current forecast completion (from the live gantt)
  originalEnd: string         // the frozen first-baseline finish - the creep reference
  plannedEnd: string          // project.plannedCompletion at capture (may differ from original)
  creepDays: number           // calendar days forecastEnd is past originalEnd (+ = slipping later)
  pctComplete: number         // 0..1 schedule progress
  labourUsedH: number         // hours logged to date
  labourBudgetH: number       // hours budgeted
  costUsed: number            // materials/supply $ to date
  costBudget: number
  subUsed: number             // subcontractor $ committed
  subBudget: number
  score: number | null        // delivery score at capture (target 100)
}

/** Calendar-day gap b - a (negative if b is earlier). Empty inputs -> 0. */
export function dayGap(a: string, b: string): number {
  if (!a || !b) return 0
  return Math.round((new Date(`${b.slice(0, 10)}T00:00:00`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00`).getTime()) / 86400000)
}

/** Whether a live job is due a safety-net snapshot: none yet, or the last one is older than minDays. */
export function shouldAutoSnapshot(snapshots: ProgressSnapshot[], now: Date, minDays = 21): boolean {
  if (!snapshots.length) return true
  const last = snapshots.reduce((m, s) => (s.capturedAt > m ? s.capturedAt : m), '')
  if (!last) return true
  return dayGap(last, now.toISOString()) >= minDays
}

/** The most recent snapshot, or null. */
export function latestSnapshot(snapshots: ProgressSnapshot[]): ProgressSnapshot | null {
  if (!snapshots.length) return null
  return snapshots.reduce((m, s) => (s.capturedAt > m.capturedAt ? s : m))
}

/** Compact creep summary for display: total drift since the first snapshot, and the last leg. */
export function summariseCreep(snapshots: ProgressSnapshot[]): {
  points: number; latestCreepDays: number; drivenSinceFirst: number; accelerating: boolean
} | null {
  const sorted = [...snapshots].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
  if (!sorted.length) return null
  const first = sorted[0], last = sorted[sorted.length - 1]
  const drivenSinceFirst = last.creepDays - first.creepDays        // how much MORE it slipped over the series
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : first
  const lastLeg = last.creepDays - prev.creepDays
  const priorLeg = sorted.length >= 3 ? prev.creepDays - sorted[sorted.length - 3].creepDays : lastLeg
  return {
    points: sorted.length,
    latestCreepDays: last.creepDays,
    drivenSinceFirst,
    accelerating: lastLeg > priorLeg && lastLeg > 0,
  }
}
