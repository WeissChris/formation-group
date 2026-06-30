import { describe, it, expect } from 'vitest'
import { xccKey, resolveXccDefault } from './xcc'

describe('xccKey', () => {
  it('normalises category case/whitespace and keeps the type', () => {
    expect(xccKey('  Site Preparation ', 'Labour')).toBe('site preparation|Labour')
    expect(xccKey('', 'Material')).toBe('|Material')
  })
})

describe('resolveXccDefault', () => {
  const defaults = {
    'site preparation|Material': '200',   // category+type
    '*|Labour': '477',                     // type-only fallback (set for Labour/Sub/Equip)
    '*|Subcontractor': '310',
  }

  it('prefers an exact category+type match', () => {
    expect(resolveXccDefault(defaults, 'Site Preparation', 'Material')).toBe('200')
  })

  it('falls back to the type-only default for Labour/Sub/Equipment', () => {
    expect(resolveXccDefault(defaults, 'Anything', 'Labour')).toBe('477')
    expect(resolveXccDefault(defaults, 'Brand New Category', 'Subcontractor')).toBe('310')
  })

  it('returns undefined for a Material in a category it has never seen (no type fallback)', () => {
    expect(resolveXccDefault(defaults, 'Decking', 'Material')).toBeUndefined()
  })

  it('exact match wins over the type fallback', () => {
    const d = { 'decking|Labour': '999', '*|Labour': '477' }
    expect(resolveXccDefault(d, 'Decking', 'Labour')).toBe('999')
  })
})
