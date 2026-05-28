import { describe, it, expect } from 'vitest'
import {
  clamp,
  getLayers,
  getItemLayer,
  getRawQty,
  getFinalQty,
  calcArea,
  calcLength,
  pixelDist,
  segLenM,
  axisSnap,
  DEFAULT_LAYER,
} from './takeoffGeometry'
import type { TakeoffData, TakeoffItem, TakeoffLayer, TakeoffMeasurement } from '@/types'

// Tests for the pure geometry helpers extracted from TakeoffTab.tsx. These calculate
// quantities (areas in m², lengths in lm) that flow into line-item totals — money-affecting
// math that previously had zero coverage.

function measurement(overrides: Partial<TakeoffMeasurement> = {}): TakeoffMeasurement {
  return {
    id: 'm1',
    type: 'area',
    points: [],
    value: 0,
    planId: 'plan1',
    ...overrides,
  }
}

function item(overrides: Partial<TakeoffItem> = {}): TakeoffItem {
  return {
    id: 'i1',
    name: 'Test item',
    quantity: 0,
    unit: 'm2',
    measurements: [],
    wastagePercent: 0,
    ...overrides,
  }
}

describe('clamp', () => {
  it('returns value unchanged when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it('clamps to lower bound', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })
  it('clamps to upper bound', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
  it('handles equal bounds', () => {
    expect(clamp(5, 7, 7)).toBe(7)
  })
})

describe('getLayers', () => {
  it('returns DEFAULT_LAYER when takeoff has no layers', () => {
    const t = { estimateId: 'e1', plans: [], groups: [] } as TakeoffData
    expect(getLayers(t)).toEqual([DEFAULT_LAYER])
  })
  it('returns DEFAULT_LAYER when layers array is empty', () => {
    const t = { estimateId: 'e1', plans: [], groups: [], layers: [] } as TakeoffData
    expect(getLayers(t)).toEqual([DEFAULT_LAYER])
  })
  it('returns provided layers when set', () => {
    const layers: TakeoffLayer[] = [
      { id: 'a', name: 'Hardscape', color: '#FF0000', visible: true },
    ]
    const t = { estimateId: 'e1', plans: [], groups: [], layers } as TakeoffData
    expect(getLayers(t)).toBe(layers)
  })
})

describe('getItemLayer', () => {
  it('returns the matched layer by id', () => {
    const layers: TakeoffLayer[] = [
      { id: 'a', name: 'A', color: '#FF0000', visible: true },
      { id: 'b', name: 'B', color: '#00FF00', visible: true },
    ]
    const t = { estimateId: 'e1', plans: [], groups: [], layers } as TakeoffData
    expect(getItemLayer(t, item({ layerId: 'b' })).id).toBe('b')
  })
  it('falls back to the first layer when layerId not found', () => {
    const layers: TakeoffLayer[] = [
      { id: 'a', name: 'A', color: '#FF0000', visible: true },
    ]
    const t = { estimateId: 'e1', plans: [], groups: [], layers } as TakeoffData
    expect(getItemLayer(t, item({ layerId: 'missing' })).id).toBe('a')
  })
  it('falls back to the first layer when item has no layerId', () => {
    const layers: TakeoffLayer[] = [
      { id: 'a', name: 'A', color: '#FF0000', visible: true },
    ]
    const t = { estimateId: 'e1', plans: [], groups: [], layers } as TakeoffData
    expect(getItemLayer(t, item()).id).toBe('a')
  })
})

describe('getRawQty', () => {
  it('returns manualOverride when set, ignoring measurements', () => {
    expect(getRawQty(item({ manualOverride: 99, measurements: [measurement({ value: 50 })] }))).toBe(99)
  })
  it('returns 0 for an item with no measurements', () => {
    expect(getRawQty(item())).toBe(0)
  })
  it('sums measurement values', () => {
    const it = item({
      measurements: [
        measurement({ value: 10 }),
        measurement({ value: 20 }),
        measurement({ value: 5 }),
      ],
    })
    expect(getRawQty(it)).toBe(35)
  })
  it('subtracts deductions from the sum', () => {
    const it = item({
      measurements: [
        measurement({ value: 100 }),
        measurement({ value: 30, isDeduction: true }),
      ],
    })
    expect(getRawQty(it)).toBe(70)
  })
  it('clamps a net-negative sum to 0 (deductions cannot push quantity below zero)', () => {
    const it = item({
      measurements: [
        measurement({ value: 10 }),
        measurement({ value: 100, isDeduction: true }),
      ],
    })
    expect(getRawQty(it)).toBe(0)
  })
  it('rounds to 2 decimal places', () => {
    const it = item({
      measurements: [
        measurement({ value: 10.123 }),
        measurement({ value: 5.456 }),
      ],
    })
    expect(getRawQty(it)).toBe(15.58)
  })
})

describe('getFinalQty', () => {
  it('returns raw qty unchanged when wastage is 0', () => {
    const it = item({ measurements: [measurement({ value: 100 })], wastagePercent: 0 })
    expect(getFinalQty(it)).toBe(100)
  })
  it('applies wastage as a percentage uplift', () => {
    const it = item({ measurements: [measurement({ value: 100 })], wastagePercent: 10 })
    expect(getFinalQty(it)).toBe(110)
  })
  it('handles 5% wastage', () => {
    const it = item({ measurements: [measurement({ value: 200 })], wastagePercent: 5 })
    expect(getFinalQty(it)).toBe(210)
  })
  it('handles fractional wastage', () => {
    const it = item({ measurements: [measurement({ value: 100 })], wastagePercent: 7.5 })
    expect(getFinalQty(it)).toBe(107.5)
  })
  it('handles undefined wastagePercent as 0', () => {
    // Older takeoff items may have been saved before wastagePercent was a field
    const it = { ...item({ measurements: [measurement({ value: 50 })] }), wastagePercent: undefined as unknown as number }
    expect(getFinalQty(it)).toBe(50)
  })
})

describe('calcArea', () => {
  // 1000×1000 pixel image, scale 10 px/m → 100m × 100m of real-world coverage
  const w = 1000
  const h = 1000
  const scale = 10

  it('returns 0 for fewer than 3 points', () => {
    expect(calcArea([], w, h, scale)).toBe(0)
    expect(calcArea([{ x: 0, y: 0 }], w, h, scale)).toBe(0)
    expect(calcArea([{ x: 0, y: 0 }, { x: 1, y: 1 }], w, h, scale)).toBe(0)
  })

  it('returns 0 for invalid scale', () => {
    const square = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0, y: 0.1 }]
    expect(calcArea(square, w, h, 0)).toBe(0)
    expect(calcArea(square, w, h, -5)).toBe(0)
  })

  it('calculates a 10m × 10m square (100 m²)', () => {
    // 10m at 10 px/m = 100 px on a 1000 px image = 0.1 normalised
    const square = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0, y: 0.1 }]
    expect(calcArea(square, w, h, scale)).toBe(100)
  })

  it('result is unsigned regardless of winding order', () => {
    const clockwise = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0, y: 0.1 }]
    const counter = [{ x: 0, y: 0 }, { x: 0, y: 0.1 }, { x: 0.1, y: 0.1 }, { x: 0.1, y: 0 }]
    expect(calcArea(clockwise, w, h, scale)).toBe(calcArea(counter, w, h, scale))
  })

  it('calculates a triangle area correctly', () => {
    // 10m × 10m right triangle → 50 m²
    const tri = [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0, y: 0.1 }]
    expect(calcArea(tri, w, h, scale)).toBe(50)
  })
})

describe('calcLength', () => {
  const w = 1000
  const h = 1000
  const scale = 10

  it('returns 0 for fewer than 2 points', () => {
    expect(calcLength([], w, h, scale)).toBe(0)
    expect(calcLength([{ x: 0, y: 0 }], w, h, scale)).toBe(0)
  })

  it('returns 0 for invalid scale', () => {
    expect(calcLength([{ x: 0, y: 0 }, { x: 1, y: 1 }], w, h, 0)).toBe(0)
  })

  it('measures a horizontal 10m line', () => {
    expect(calcLength([{ x: 0, y: 0 }, { x: 0.1, y: 0 }], w, h, scale)).toBe(10)
  })

  it('measures a diagonal correctly via Pythagoras', () => {
    // 10m × 10m hypotenuse ≈ 14.142
    const len = calcLength([{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }], w, h, scale)
    expect(len).toBeCloseTo(14.14, 2)
  })

  it('sums multi-segment polylines', () => {
    // 10m + 10m = 20m
    const len = calcLength(
      [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }],
      w,
      h,
      scale,
    )
    expect(len).toBe(20)
  })
})

describe('pixelDist + segLenM', () => {
  it('pixelDist returns 0 for coincident points', () => {
    expect(pixelDist({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1000, 1000)).toBe(0)
  })
  it('pixelDist computes Euclidean distance in image pixels', () => {
    expect(pixelDist({ x: 0, y: 0 }, { x: 0.3, y: 0.4 }, 1000, 1000)).toBeCloseTo(500, 2)
  })
  it('segLenM returns 0 for invalid scale', () => {
    expect(segLenM({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 1000, 1000, 0)).toBe(0)
  })
  it('segLenM converts pixels to metres via scale', () => {
    // 100 px at 10 px/m = 10 m
    expect(segLenM({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 1000, 1000, 10)).toBe(10)
  })
})

describe('axisSnap', () => {
  const w = 1000
  const h = 1000
  const anchor = { x: 0.5, y: 0.5 }

  it('snaps near-horizontal to exactly horizontal', () => {
    const p = { x: 0.7, y: 0.51 }  // ~3° off horizontal
    const snapped = axisSnap(anchor, p, w, h)
    expect(snapped.y).toBeCloseTo(anchor.y, 6)
    expect(snapped.x).toBeGreaterThan(anchor.x)
  })

  it('snaps near-vertical to exactly vertical', () => {
    const p = { x: 0.51, y: 0.7 }
    const snapped = axisSnap(anchor, p, w, h)
    expect(snapped.x).toBeCloseTo(anchor.x, 6)
    expect(snapped.y).toBeGreaterThan(anchor.y)
  })

  it('snaps near-45° to exact 45° diagonal', () => {
    const p = { x: 0.7, y: 0.71 }
    const snapped = axisSnap(anchor, p, w, h)
    // On a square image, exact 45° means equal dx/dy in pixel space
    const dx = (snapped.x - anchor.x) * w
    const dy = (snapped.y - anchor.y) * h
    expect(Math.abs(dx)).toBeCloseTo(Math.abs(dy), 6)
  })

  it('preserves the original distance from anchor', () => {
    const p = { x: 0.7, y: 0.51 }
    const original = pixelDist(anchor, p, w, h)
    const snapped = axisSnap(anchor, p, w, h)
    const after = pixelDist(anchor, snapped, w, h)
    expect(after).toBeCloseTo(original, 6)
  })
})
