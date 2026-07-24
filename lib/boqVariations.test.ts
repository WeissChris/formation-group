import { describe, it, expect } from 'vitest'
import { vmoCategory, acceptedVariations, mergeAcceptedVariations } from './boqVariations'

const base = () => ({
  id: 'base', parent_estimate_id: null, status: 'accepted', archived: false,
  line_items: [
    { id: 'b1', category: 'Paving', type: 'Labour', units: 100, total: 6800 },
  ],
  category_notes: { Paving: 'lay from the north end' },
})

const vmo = (n: number, over: Record<string, unknown> = {}) => ({
  id: `v${n}`, parent_estimate_id: 'base', status: 'accepted', archived: false, variation_number: n,
  line_items: [
    { id: `v${n}l1`, category: 'Fencing', type: 'Labour', units: 90, total: 6120 },
    { id: `v${n}l2`, category: '', type: 'Material', units: 1, total: 2300 },
  ],
  category_notes: { Fencing: 'match existing paling height' },
  ...over,
})

describe('vmoCategory', () => {
  it('prefixes the line category with the VMO number', () => {
    expect(vmoCategory(2, 'Excavation')).toBe('VMO-2 · Excavation')
  })
  it('falls back to just the VMO label when the line has no category', () => {
    expect(vmoCategory(2, '')).toBe('VMO-2')
    expect(vmoCategory(2, '  ')).toBe('VMO-2')
    expect(vmoCategory(undefined, 'X')).toBe('VMO-? · X')
  })
})

describe('acceptedVariations', () => {
  it('keeps only accepted, un-archived variations, ordered by number', () => {
    const rows = [
      base(),
      vmo(2),
      vmo(1),
      vmo(3, { status: 'sent' }),          // still with the client
      vmo(4, { status: 'declined', archived: true }),
      vmo(5, { status: 'draft' }),          // with the office
    ]
    expect(acceptedVariations(rows).map(r => r.variation_number)).toEqual([1, 2])
  })
})

describe('mergeAcceptedVariations', () => {
  it('appends each accepted variation line with a prefixed category', () => {
    const merged = mergeAcceptedVariations(base(), [vmo(1), vmo(2, { status: 'sent' })])!
    const lines = merged.line_items as Record<string, unknown>[]
    expect(lines.map(l => l.category)).toEqual(['Paving', 'VMO-1 · Fencing', 'VMO-1'])
    // labour units survive untouched - this is what feeds the scorecard's labour allowance
    expect(lines[1].units).toBe(90)
  })

  it('carries variation category notes under the prefixed key', () => {
    const merged = mergeAcceptedVariations(base(), [vmo(1)])!
    expect(merged.category_notes).toEqual({
      Paving: 'lay from the north end',
      'VMO-1 · Fencing': 'match existing paling height',
    })
  })

  it('returns the base untouched when there are no accepted variations', () => {
    const b = base()
    expect(mergeAcceptedVariations(b, [vmo(1, { status: 'sent' })])).toBe(b)
  })

  it('does not mutate the inputs', () => {
    const b = base(), v = vmo(1)
    mergeAcceptedVariations(b, [v])
    expect((b.line_items as unknown[]).length).toBe(1)
    expect((v.line_items as Record<string, unknown>[])[0].category).toBe('Fencing')
  })

  it('passes a null base through', () => {
    expect(mergeAcceptedVariations(null, [vmo(1)])).toBeNull()
  })
})
