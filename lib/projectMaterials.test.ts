import { describe, it, expect } from 'vitest'
import { isMaterialFilled, unconfirmedMaterials, sanitizeMaterials, type SiteMaterial } from './projectMaterials'

const m = (over: Partial<SiteMaterial> = {}): SiteMaterial => ({
  id: 'm1', type: 'Bluestone', source: 'ABC Stone', allowance: 1200, confirmed: false, ...over,
})

describe('isMaterialFilled', () => {
  it('is true when any of type/source/allowance is set', () => {
    expect(isMaterialFilled(m({ type: 'X', source: '', allowance: 0 }))).toBe(true)
    expect(isMaterialFilled(m({ type: '', source: 'Yard', allowance: 0 }))).toBe(true)
    expect(isMaterialFilled(m({ type: '', source: '', allowance: 50 }))).toBe(true)
  })
  it('is false for a blank row', () => {
    expect(isMaterialFilled(m({ type: '  ', source: '', allowance: 0 }))).toBe(false)
  })
})

describe('unconfirmedMaterials', () => {
  it('returns only filled, unconfirmed rows', () => {
    const list = [
      m({ id: 'a', confirmed: false }),
      m({ id: 'b', confirmed: true }),
      m({ id: 'c', type: '', source: '', allowance: 0, confirmed: false }), // blank -> ignored
    ]
    expect(unconfirmedMaterials(list).map(x => x.id)).toEqual(['a'])
  })
})

describe('sanitizeMaterials', () => {
  it('coerces fields, drops empties and rows without an id, caps at 200', () => {
    const raw = [
      { id: 'a', type: 'Sand', source: 'Yard', allowance: '300', confirmed: true },
      { id: 'b' },                       // empty -> dropped
      { type: 'no id', allowance: 5 },   // no id -> dropped
      'garbage',
    ]
    const out = sanitizeMaterials(raw)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ id: 'a', type: 'Sand', source: 'Yard', allowance: 300, confirmed: true })
  })
  it('returns [] for non-arrays', () => {
    expect(sanitizeMaterials(null)).toEqual([])
    expect(sanitizeMaterials({})).toEqual([])
  })
})
