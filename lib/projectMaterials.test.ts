import { describe, it, expect } from 'vitest'
import { isMaterialFilled, unconfirmedMaterials, sanitizeMaterials, materialRowsFromLines, type SiteMaterial } from './projectMaterials'

let seq = 0
const gid = () => `g${++seq}`

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

describe('materialRowsFromLines', () => {
  it('makes one row per material description, summing allowances', () => {
    seq = 0
    const lines = [
      { description: 'Bluestone', type: 'Material', total: 100 },
      { description: 'Bluestone', type: 'Material', total: 50 },     // summed with the above
      { description: 'Labour', type: 'Labour', total: 999 },          // not a material
      { description: 'Cement', crewType: 'Material', total: 30 },     // crewType counts too
    ]
    const out = materialRowsFromLines(lines, [], gid)
    expect(out.map(r => [r.type, r.allowance])).toEqual([['Bluestone', 150], ['Cement', 30]])
    expect(out.every(r => !r.confirmed && r.source === '')).toBe(true)
  })
  it('skips materials already listed (case-insensitive) and disabled lines', () => {
    const out = materialRowsFromLines(
      [{ description: 'Sand', type: 'Material', total: 20 }, { description: 'Gravel', type: 'Material', total: 40, enabled: false }],
      [{ id: 'x', type: 'SAND', source: '', allowance: 0, confirmed: false }],
      gid,
    )
    expect(out).toEqual([])
  })
})
