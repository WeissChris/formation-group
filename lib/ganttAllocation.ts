import type { GanttSegment } from '@/types'

// ── Per-period labour / material / equipment allocation ───────────────────────
// A scope's cost (labour, material, equipment) is spread across its work periods as a percentage each.
// The invariant the whole forecast depends on: the DATED periods' percentages always sum to exactly
// 100%, so the full budget is allocated — never 95% (cost silently lost) nor 110% (cost invented).
// Undated placeholder periods carry 0% until they're scheduled.

type AllocKey = 'labourPct' | 'materialsPct' | 'equipmentPct'

const isDated = (s: Pick<GanttSegment, 'startDate' | 'endDate'>): boolean => !!(s.startDate && s.endDate)

/**
 * Normalise one resource's per-period % so the DATED periods sum to exactly 100%. Used on load and after
 * every recompute to clean any stored set that doesn't add up (legacy data, rounding drift). If no period
 * carries a weight, the budget is split evenly across the dated periods. Undated periods → 0.
 * Returns a new array of percentages aligned 1:1 with `segments`.
 */
export function normalizedPcts(segments: GanttSegment[], key: AllocKey): number[] {
  const datedIdx = segments.map((s, i) => (isDated(s) ? i : -1)).filter(i => i >= 0)
  const n = datedIdx.length
  const out = segments.map(() => 0)
  if (n === 0) return out
  const raw = datedIdx.map(i => Math.max(0, segments[i][key] ?? 0))
  const sum = raw.reduce((a, b) => a + b, 0)
  const norm = sum > 0 ? raw.map(r => (r / sum) * 100) : raw.map(() => 100 / n)
  datedIdx.forEach((segIdx, k) => { out[segIdx] = norm[k] })
  return out
}

/**
 * Auto-balance: pin the anchor period to `value` (clamped 0–100) and scale the OTHER dated periods to
 * fill the remaining (100 − value), preserving their relative proportions (even split if they're all
 * zero). Guarantees the dated periods sum to exactly 100%. If the anchor is the only dated period it
 * takes the full 100%. Returns a new array of percentages aligned 1:1 with `segments`.
 */
export function rebalancedPcts(segments: GanttSegment[], anchorId: string, key: AllocKey, value: number): number[] {
  const v = Math.max(0, Math.min(100, value))
  const out = segments.map(s => (isDated(s) ? Math.max(0, s[key] ?? 0) : 0))
  const anchorIdx = segments.findIndex(s => s.id === anchorId)
  if (anchorIdx < 0 || !isDated(segments[anchorIdx])) return normalizedPcts(segments, key)
  out[anchorIdx] = v
  const otherIdx = segments.map((s, i) => (isDated(s) && i !== anchorIdx ? i : -1)).filter(i => i >= 0)
  if (otherIdx.length === 0) { out[anchorIdx] = 100; return out }
  const remaining = 100 - v
  const otherSum = otherIdx.reduce((a, i) => a + out[i], 0)
  otherIdx.forEach(i => { out[i] = otherSum > 0 ? (out[i] / otherSum) * remaining : remaining / otherIdx.length })
  return out
}

/** Count only the DATED periods of a scope (undated placeholders aren't real periods yet). */
export function datedPeriodCount(segments: GanttSegment[]): number {
  return segments.filter(isDated).length
}
