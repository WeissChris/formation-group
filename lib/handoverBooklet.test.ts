import { describe, it, expect } from 'vitest'
import { materialsSummaryFromLines, DEFAULT_CARE_LIBRARY } from './handoverBooklet'

describe('materialsSummaryFromLines', () => {
  it('groups material lines by category, one line each, de-duped', () => {
    const out = materialsSummaryFromLines([
      { description: 'Alba crazy paving', category: 'Paving', type: 'Material' },
      { description: 'Ubud green', category: 'Paving', type: 'Material' },
      { description: 'Alba crazy paving', category: 'Paving', type: 'Material' },  // dup
      { description: '32Mpa mix', category: 'Concrete', crewType: 'Material' },     // crewType counts
      { description: 'Labour', category: 'Paving', type: 'Labour' },               // not a material
      { description: 'Off cut', category: 'Concrete', type: 'Material', enabled: false }, // disabled
    ])
    expect(out).toBe('Paving: Alba crazy paving, Ubud green\nConcrete: 32Mpa mix')
  })
  it('returns empty string when there are no material lines', () => {
    expect(materialsSummaryFromLines([{ description: 'x', type: 'Labour' }])).toBe('')
  })
})

describe('DEFAULT_CARE_LIBRARY', () => {
  it('has stable ids and non-empty bodies', () => {
    expect(DEFAULT_CARE_LIBRARY[0].id).toBe('care-0')
    expect(DEFAULT_CARE_LIBRARY.every(g => g.id && g.element && g.body)).toBe(true)
    expect(new Set(DEFAULT_CARE_LIBRARY.map(g => g.id)).size).toBe(DEFAULT_CARE_LIBRARY.length)
  })
})
