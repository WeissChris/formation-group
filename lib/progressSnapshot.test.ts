import { describe, it, expect } from 'vitest'
import { dayGap, shouldAutoSnapshot, latestSnapshot, summariseCreep, type ProgressSnapshot } from './progressSnapshot'

const snap = (capturedAt: string, creepDays: number): ProgressSnapshot => ({
  id: capturedAt, capturedAt, trigger: 'invoice', forecastEnd: '', originalEnd: '', plannedEnd: '',
  creepDays, pctComplete: 0, labourUsedH: 0, labourBudgetH: 0, costUsed: 0, costBudget: 0,
  subUsed: 0, subBudget: 0, score: null,
})

describe('dayGap', () => {
  it('counts calendar days forward and back', () => {
    expect(dayGap('2026-07-01', '2026-07-08')).toBe(7)
    expect(dayGap('2026-07-08', '2026-07-01')).toBe(-7)
  })
  it('returns 0 for empty inputs', () => {
    expect(dayGap('', '2026-07-08')).toBe(0)
    expect(dayGap('2026-07-08', '')).toBe(0)
  })
})

describe('shouldAutoSnapshot', () => {
  const now = new Date('2026-07-30T00:00:00Z')
  it('is true when there are none', () => {
    expect(shouldAutoSnapshot([], now)).toBe(true)
  })
  it('is true when the last is older than the window', () => {
    expect(shouldAutoSnapshot([snap('2026-07-01T00:00:00Z', 0)], now)).toBe(true)   // 29 days
  })
  it('is false when a recent snapshot exists', () => {
    expect(shouldAutoSnapshot([snap('2026-07-25T00:00:00Z', 0)], now)).toBe(false)  // 5 days
  })
  it('uses the newest, not the array order', () => {
    const s = [snap('2026-07-25T00:00:00Z', 0), snap('2026-06-01T00:00:00Z', 0)]
    expect(shouldAutoSnapshot(s, now)).toBe(false)
  })
})

describe('latestSnapshot', () => {
  it('returns the newest by timestamp', () => {
    const s = [snap('2026-06-01T00:00:00Z', 2), snap('2026-07-25T00:00:00Z', 9)]
    expect(latestSnapshot(s)?.creepDays).toBe(9)
  })
  it('returns null when empty', () => {
    expect(latestSnapshot([])).toBeNull()
  })
})

describe('summariseCreep', () => {
  it('reports drift since first and flags acceleration', () => {
    // creep 0 -> 3 -> 9: last leg (6) > prior leg (3) -> accelerating
    const s = [snap('2026-06-01T00:00:00Z', 0), snap('2026-06-15T00:00:00Z', 3), snap('2026-07-01T00:00:00Z', 9)]
    const r = summariseCreep(s)!
    expect(r.points).toBe(3)
    expect(r.latestCreepDays).toBe(9)
    expect(r.drivenSinceFirst).toBe(9)
    expect(r.accelerating).toBe(true)
  })
  it('does not flag acceleration when the last leg is flat', () => {
    const s = [snap('2026-06-01T00:00:00Z', 5), snap('2026-06-15T00:00:00Z', 8), snap('2026-07-01T00:00:00Z', 8)]
    expect(summariseCreep(s)!.accelerating).toBe(false)
  })
  it('returns null for an empty series', () => {
    expect(summariseCreep([])).toBeNull()
  })
})
