import { describe, it, expect } from 'vitest'
import { nextZoneColor, zoneCentroid, sanitizeZones, ZONE_COLORS, type IrrigationZone } from './irrigationPlan'

const z = (over: Partial<IrrigationZone> = {}): IrrigationZone => ({
  id: 'z1', label: 'Zone 1', color: ZONE_COLORS[0],
  points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], ...over,
})

describe('nextZoneColor', () => {
  it('returns the first unused colour', () => {
    expect(nextZoneColor([])).toBe(ZONE_COLORS[0])
    expect(nextZoneColor([z({ color: ZONE_COLORS[0] })])).toBe(ZONE_COLORS[1])
  })
})

describe('zoneCentroid', () => {
  it('averages the points', () => {
    const c = zoneCentroid(z({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }))
    expect(c).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('sanitizeZones', () => {
  it('keeps valid zones, clamps points, defaults a bad colour', () => {
    const out = sanitizeZones([
      { id: 'a', label: 'Front', color: '#ABCDEF', points: [{ x: -1, y: 2 }, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.2 }] },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].points[0]).toEqual({ x: 0, y: 1 })          // clamped to 0..1
    expect(out[0].color).toBe('#ABCDEF')
  })
  it('drops zones without an id or with fewer than 2 points, and non-arrays', () => {
    expect(sanitizeZones([{ id: '', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }])).toEqual([])
    expect(sanitizeZones([{ id: 'x', points: [{ x: 0, y: 0 }] }])).toEqual([])
    expect(sanitizeZones(null)).toEqual([])
  })
})
