import { describe, it, expect } from 'vitest'
import { normaliseName, namesMatch, matchScopesToSubbies, nextDueScope, type ScopeLike } from './subbieScopes'

const scope = (over: Partial<ScopeLike> & { category: string }): ScopeLike => ({
  due: '2026-08-01', inDays: 12, booked: false, comments: [], ...over,
})

const CONCRETER = { id: 's1', name: 'Hardrock Concreting', trade: 'Concrete' }
const SPARKY = { id: 's2', name: 'Volt Electrical', trade: 'Electrical' }

describe('normaliseName / namesMatch', () => {
  it('ignores case and punctuation', () => {
    expect(normaliseName('Concrete - Slab!')).toBe('concrete slab')
    expect(namesMatch('Concrete', 'concrete')).toBe(true)
    expect(namesMatch('Concrete', 'Concrete - slab')).toBe(true)
  })
  it('does not match unrelated trades', () => {
    expect(namesMatch('Concrete', 'Electrical')).toBe(false)
  })
  it('never matches on an empty name', () => {
    expect(namesMatch('', 'Concrete')).toBe(false)
    expect(namesMatch('Concrete', '   ')).toBe(false)
  })
})

describe('matchScopesToSubbies', () => {
  it('guesses the company from the trade name', () => {
    const out = matchScopesToSubbies([scope({ category: 'Concrete - slab' })], [CONCRETER, SPARKY])
    expect(out.subbies.find(s => s.subbie.id === 's1')!.scopes.map(s => s.category)).toEqual(['Concrete - slab'])
    expect(out.subbies.find(s => s.subbie.id === 's1')!.suggested).toBe(true)
    expect(out.subbies.find(s => s.subbie.id === 's2')!.scopes).toEqual([])
    expect(out.unlinked).toEqual([])
  })

  it('an explicit subbieId beats the name match', () => {
    // The category says Concrete, but the foreman linked it to the sparky - honour that.
    const out = matchScopesToSubbies([scope({ category: 'Concrete', subbieId: 's2' })], [CONCRETER, SPARKY])
    expect(out.subbies.find(s => s.subbie.id === 's2')!.scopes.map(s => s.category)).toEqual(['Concrete'])
    expect(out.subbies.find(s => s.subbie.id === 's2')!.suggested).toBe(false)
    expect(out.subbies.find(s => s.subbie.id === 's1')!.scopes).toEqual([])
  })

  it('ignores a stale link to a package that no longer exists and falls back to the guess', () => {
    const out = matchScopesToSubbies([scope({ category: 'Concrete', subbieId: 'gone' })], [CONCRETER])
    expect(out.subbies[0].scopes).toHaveLength(1)
  })

  it('returns scopes with no company as unlinked', () => {
    const out = matchScopesToSubbies([scope({ category: 'Crane hire' })], [CONCRETER, SPARKY])
    expect(out.unlinked.map(s => s.category)).toEqual(['Crane hire'])
    expect(out.subbies.every(s => s.scopes.length === 0)).toBe(true)
  })

  it('gives a company all of its scopes, soonest first', () => {
    const out = matchScopesToSubbies([
      scope({ category: 'Concrete - paths', due: '2026-09-01' }),
      scope({ category: 'Concrete - slab', due: '2026-08-01' }),
    ], [CONCRETER])
    expect(out.subbies[0].scopes.map(s => s.due)).toEqual(['2026-08-01', '2026-09-01'])
  })

  it('lists every package even when nothing on the schedule matches it', () => {
    const out = matchScopesToSubbies([], [CONCRETER, SPARKY])
    expect(out.subbies).toHaveLength(2)
  })
})

describe('nextDueScope', () => {
  it('picks the soonest unbooked scope', () => {
    const s = nextDueScope([
      scope({ category: 'a', due: '2026-08-05', booked: true }),
      scope({ category: 'b', due: '2026-08-10' }),
      scope({ category: 'c', due: '2026-08-20' }),
    ])
    expect(s!.category).toBe('b')
  })
  it('falls back to the soonest booked scope when everything is booked', () => {
    const s = nextDueScope([
      scope({ category: 'a', due: '2026-08-20', booked: true }),
      scope({ category: 'b', due: '2026-08-10', booked: true }),
    ])
    expect(s!.category).toBe('b')
  })
  it('is null with no scopes', () => {
    expect(nextDueScope([])).toBeNull()
  })
})
