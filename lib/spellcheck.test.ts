import { describe, it, expect, vi, beforeAll } from 'vitest'

// A fake dictionary so the test is deterministic and offline: only these words are "known".
const KNOWN = new Set(['hello', 'world', 'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'paving', 'scope', 'behind', 'wall'])

vi.mock('typo-js', () => ({
  default: class {
    check(w: string) { return KNOWN.has(w.toLowerCase()) }
    suggest(_w: string, n: number) { return ['sug1', 'sug2', 'sug3', 'sug4', 'sug5', 'sug6', 'sug7'].slice(0, n) }
  },
}))

beforeAll(() => {
  // loadChecker fetches the .aff/.dic; the mocked Typo ignores the contents.
  global.fetch = vi.fn(async () => ({ text: async () => '' })) as unknown as typeof fetch
})

import { checkSpelling } from './spellcheck'

describe('checkSpelling', () => {
  it('flags an unknown word with its location label and surrounding context', async () => {
    const issues = await checkSpelling([{ label: 'Intro', text: 'the Hunza paving over the wall' }])
    expect(issues).toHaveLength(1)
    const i = issues[0]
    expect(i.word).toBe('Hunza')
    expect(i.count).toBe(1)
    expect(i.occurrences[0].label).toBe('Intro')
    expect(i.occurrences[0].match).toBe('Hunza')
    expect(i.occurrences[0].before).toContain('the')
    expect(i.occurrences[0].after).toContain('paving')
  })

  it('dedupes case-insensitively but keeps every occurrence with its own context', async () => {
    const issues = await checkSpelling([
      { label: 'Intro', text: 'Hunza paving over the wall' },
      { label: 'Scope: Paving', text: 'the hunza behind the wall' },
    ])
    expect(issues).toHaveLength(1)
    expect(issues[0].count).toBe(2)
    expect(issues[0].occurrences.map(o => o.label)).toEqual(['Intro', 'Scope: Paving'])
  })

  it('returns up to six suggestions', async () => {
    const issues = await checkSpelling([{ label: 'x', text: 'Hunza' }])
    expect(issues[0].suggestions).toEqual(['sug1', 'sug2', 'sug3', 'sug4', 'sug5', 'sug6'])
  })

  it('skips acronyms, short tokens and numbers', async () => {
    // GST/PVC are all-caps acronyms; every other token is a known word or too short/numeric.
    const issues = await checkSpelling([{ label: 'x', text: 'GST the PVC over 10 dog' }])
    expect(issues).toHaveLength(0)
  })

  it('accepts bare strings for back-compat (empty label)', async () => {
    const issues = await checkSpelling(['the Hunza wall'])
    expect(issues[0].occurrences[0].label).toBe('')
  })

  it('caps occurrences but still counts them all', async () => {
    const text = Array(10).fill('Hunza').join(' over ')   // 10 occurrences, joined by a known word
    const issues = await checkSpelling([{ label: 'x', text }])
    expect(issues[0].count).toBe(10)
    expect(issues[0].occurrences.length).toBeLessThanOrEqual(6)
  })
})
