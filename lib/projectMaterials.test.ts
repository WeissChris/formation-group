import { describe, it, expect } from 'vitest'
import {
  isMaterialFilled, unconfirmedMaterials, sanitizeMaterials, materialRowsFromLines,
  materialVariance, materialTotals, overspentMaterials, MAX_QUOTES_PER_MATERIAL,
  type SiteMaterial,
} from './projectMaterials'

let seq = 0
const gid = () => `g${++seq}`

const m = (over: Partial<SiteMaterial> = {}): SiteMaterial => ({
  id: 'm1', type: 'Bluestone', source: 'ABC Stone', allowance: 1200,
  actual: 0, notes: '', quotes: [], confirmed: false, ...over,
})

describe('isMaterialFilled', () => {
  it('is true when any of type/source/allowance is set', () => {
    expect(isMaterialFilled(m({ type: 'X', source: '', allowance: 0 }))).toBe(true)
    expect(isMaterialFilled(m({ type: '', source: 'Yard', allowance: 0 }))).toBe(true)
    expect(isMaterialFilled(m({ type: '', source: '', allowance: 50 }))).toBe(true)
  })
  it('also counts the new fields, so a row with only an actual/note/quote survives a save', () => {
    expect(isMaterialFilled(m({ type: '', source: '', allowance: 0, actual: 90 }))).toBe(true)
    expect(isMaterialFilled(m({ type: '', source: '', allowance: 0, notes: 'ring the yard' }))).toBe(true)
    expect(isMaterialFilled(m({ type: '', source: '', allowance: 0, quotes: [{ name: 'q.pdf', path: 'p/1/q.pdf' }] }))).toBe(true)
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

describe('materialVariance', () => {
  it('is null until something is actually spent', () => {
    expect(materialVariance({ allowance: 1200, actual: 0 })).toBeNull()
  })
  it('reports under-spend as a negative diff', () => {
    const v = materialVariance({ allowance: 1000, actual: 900 })!
    expect(v.diff).toBe(-100)
    expect(v.pct).toBeCloseTo(-0.1)
    expect(v.over).toBe(false)
  })
  it('reports over-spend as a positive diff', () => {
    const v = materialVariance({ allowance: 1000, actual: 1250 })!
    expect(v.diff).toBe(250)
    expect(v.pct).toBeCloseTo(0.25)
    expect(v.over).toBe(true)
  })
  it('has no percentage when nothing was allowed', () => {
    const v = materialVariance({ allowance: 0, actual: 400 })!
    expect(v.diff).toBe(400)
    expect(v.pct).toBeNull()
    expect(v.over).toBe(true)
  })
  it('rounds to cents, so float subtraction never leaks a long tail', () => {
    // 1200.30 - 1000.10 is 200.19999999999993 in float maths.
    expect(materialVariance({ allowance: 1000.10, actual: 1200.30 })!.diff).toBe(200.2)
  })
})

describe('overspentMaterials / materialTotals', () => {
  const list = [
    m({ id: 'a', allowance: 1000, actual: 1200 }),   // over
    m({ id: 'b', allowance: 500, actual: 400 }),     // under
    m({ id: 'c', allowance: 300, actual: 0 }),       // not spent yet
  ]
  it('flags only the rows that came in over', () => {
    expect(overspentMaterials(list).map(x => x.id)).toEqual(['a'])
  })
  it('totals allowance, actual and the difference', () => {
    expect(materialTotals(list)).toEqual({ allowance: 1800, actual: 1600, diff: -200 })
  })
})

describe('sanitizeMaterials', () => {
  it('coerces every field, drops empties and rows without an id', () => {
    const raw = [
      { id: 'a', type: 'Sand', source: 'Yard', allowance: '300', actual: '325.5', notes: 'ring first', confirmed: true, category: 'Softworks' },
      { id: 'b' },                       // empty -> dropped
      { type: 'no id', allowance: 5 },   // no id -> dropped
      'garbage',
    ]
    const out = sanitizeMaterials(raw)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({
      id: 'a', type: 'Sand', source: 'Yard', allowance: 300, actual: 325.5,
      notes: 'ring first', quotes: [], category: 'Softworks', confirmed: true,
    })
  })
  it('keeps quotes with a path, drops the rest, and caps them', () => {
    const quotes = Array.from({ length: MAX_QUOTES_PER_MATERIAL + 3 }, (_, i) => ({ name: `q${i}.pdf`, path: `p/m/q${i}.pdf` }))
    const out = sanitizeMaterials([{ id: 'a', type: 'Sand', quotes: [...quotes, { name: 'orphan' }] }])
    expect(out[0].quotes).toHaveLength(MAX_QUOTES_PER_MATERIAL)
    expect(out[0].quotes.every(q => q.path)).toBe(true)
  })
  it('defaults the new fields on legacy rows saved before they existed', () => {
    const out = sanitizeMaterials([{ id: 'a', type: 'Sand', source: '', allowance: 100, confirmed: false }])
    expect(out[0]).toMatchObject({ actual: 0, notes: '', quotes: [] })
  })
  it('returns [] for non-arrays', () => {
    expect(sanitizeMaterials(null)).toEqual([])
    expect(sanitizeMaterials({})).toEqual([])
  })
})

describe('materialRowsFromLines', () => {
  it('makes one row per material description, summing allowances', () => {
    seq = 0
    const lines = [
      { description: 'Bluestone', type: 'Material', total: 100, category: 'Paving' },
      { description: 'Bluestone', type: 'Material', total: 50 },     // summed with the above
      { description: 'Labour', type: 'Labour', total: 999 },          // not a material
      { description: 'Cement', crewType: 'Material', total: 30 },     // crewType counts too
    ]
    const out = materialRowsFromLines(lines, [], gid)
    expect(out.map(r => [r.type, r.allowance])).toEqual([['Bluestone', 150], ['Cement', 30]])
    expect(out.every(r => !r.confirmed && r.source === '' && r.actual === 0 && r.quotes.length === 0)).toBe(true)
  })
  it('carries the estimate category through so the allowance can be traced back', () => {
    seq = 0
    const out = materialRowsFromLines([{ description: 'Bluestone', type: 'Material', total: 100, category: 'Paving' }], [], gid)
    expect(out[0].category).toBe('Paving')
  })
  it('skips materials already listed (case-insensitive) and disabled lines', () => {
    const out = materialRowsFromLines(
      [{ description: 'Sand', type: 'Material', total: 20 }, { description: 'Gravel', type: 'Material', total: 40, enabled: false }],
      [m({ id: 'x', type: 'SAND', source: '', allowance: 0 })],
      gid,
    )
    expect(out).toEqual([])
  })
})
