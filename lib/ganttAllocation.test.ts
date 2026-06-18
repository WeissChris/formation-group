import { describe, it, expect } from 'vitest'
import { normalizedPcts, rebalancedPcts, datedPeriodCount } from './ganttAllocation'
import type { GanttSegment } from '@/types'

const seg = (id: string, dated: boolean, mat?: number, eq?: number): GanttSegment => ({
  id,
  startDate: dated ? '2026-06-15' : '',
  endDate: dated ? '2026-06-19' : '',
  weekCount: dated ? 1 : 0,
  revenueAllocation: 0,
  costAllocation: 0,
  materialsPct: mat,
  equipmentPct: eq,
})

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('normalizedPcts', () => {
  it('rescales an under-allocated set to exactly 100% (the 95% bug)', () => {
    const segs = [seg('a', true, 16.67), seg('b', true, 45), seg('c', true, 33.33)] // sums to 95
    const out = normalizedPcts(segs, 'materialsPct')
    expect(sum(out)).toBeCloseTo(100, 6)
    expect(out[1]).toBeCloseTo(45 / 95 * 100, 4) // relative weights preserved
  })

  it('rescales an over-allocated set down to 100%', () => {
    const segs = [seg('a', true, 60), seg('b', true, 60)] // sums to 120
    const out = normalizedPcts(segs, 'materialsPct')
    expect(sum(out)).toBeCloseTo(100, 6)
    expect(out[0]).toBeCloseTo(50, 6)
  })

  it('even-splits when nothing is set', () => {
    const segs = [seg('a', true), seg('b', true), seg('c', true)]
    const out = normalizedPcts(segs, 'materialsPct')
    expect(out).toEqual([100 / 3, 100 / 3, 100 / 3])
    expect(sum(out)).toBeCloseTo(100, 6)
  })

  it('gives undated periods 0% and only counts dated ones', () => {
    const segs = [seg('a', true, 50), seg('b', true, 50), seg('c', false, 80)]
    const out = normalizedPcts(segs, 'materialsPct')
    expect(out[2]).toBe(0)
    expect(sum(out)).toBeCloseTo(100, 6)
  })

  it('handles no dated periods', () => {
    expect(normalizedPcts([seg('a', false), seg('b', false)], 'materialsPct')).toEqual([0, 0])
  })
})

describe('rebalancedPcts', () => {
  it('pins the anchor and fills the balance across the rest (75/balance)', () => {
    const segs = [seg('a', true, 50), seg('b', true, 50)]
    const out = rebalancedPcts(segs, 'a', 'materialsPct', 75)
    expect(out[0]).toBe(75)
    expect(out[1]).toBe(25)
    expect(sum(out)).toBe(100)
  })

  it('fills the balance proportionally to the others existing weights', () => {
    const segs = [seg('a', true, 0), seg('b', true, 40), seg('c', true, 60)]
    const out = rebalancedPcts(segs, 'a', 'materialsPct', 50)
    expect(out[0]).toBe(50)
    expect(out[1]).toBeCloseTo(40 / 100 * 50, 6) // 20
    expect(out[2]).toBeCloseTo(60 / 100 * 50, 6) // 30
    expect(sum(out)).toBeCloseTo(100, 6)
  })

  it('even-splits the balance when the others are all zero', () => {
    const segs = [seg('a', true, 0), seg('b', true, 0), seg('c', true, 0)]
    const out = rebalancedPcts(segs, 'a', 'materialsPct', 40)
    expect(out[0]).toBe(40)
    expect(out[1]).toBeCloseTo(30, 6)
    expect(out[2]).toBeCloseTo(30, 6)
    expect(sum(out)).toBeCloseTo(100, 6)
  })

  it('clamps the anchor to 0-100 and gives the sole dated period 100%', () => {
    const segs = [seg('a', true, 10), seg('b', false, 90)]
    const out = rebalancedPcts(segs, 'a', 'materialsPct', 150)
    expect(out[0]).toBe(100)
    expect(out[1]).toBe(0)
  })

  it('ignores undated periods when filling the balance', () => {
    const segs = [seg('a', true, 50), seg('b', true, 50), seg('c', false, 0)]
    const out = rebalancedPcts(segs, 'a', 'materialsPct', 80)
    expect(out[0]).toBe(80)
    expect(out[1]).toBe(20)
    expect(out[2]).toBe(0)
    expect(sum(out)).toBe(100)
  })
})

describe('datedPeriodCount', () => {
  it('counts only dated periods', () => {
    expect(datedPeriodCount([seg('a', true), seg('b', true), seg('c', false)])).toBe(2)
  })
})
