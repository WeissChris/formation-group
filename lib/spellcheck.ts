// Client-side spell checker for the client-facing documents (OPC, Quote). Deterministic pass
// against a real en_AU hunspell dictionary (typo-js + /public/dict) rather than relying on the
// browser's while-you-type squiggles, which depend on each person's Chrome settings.
//
// Words the business uses that aren't in the dictionary (product names, suppliers, stone types)
// are ignorable - the ignore list persists in localStorage and applies to every future check.

import Typo from 'typo-js'

let checker: Typo | null = null
let loading: Promise<Typo> | null = null

async function loadChecker(): Promise<Typo> {
  if (checker) return checker
  if (!loading) {
    loading = (async () => {
      const [aff, dic] = await Promise.all([
        fetch('/dict/en_AU.aff').then(r => r.text()),
        fetch('/dict/en_AU.dic').then(r => r.text()),
      ])
      checker = new Typo('en_AU', aff, dic)
      return checker
    })()
  }
  return loading
}

const IGNORE_KEY = 'fg_spell_ignore'

export function loadIgnoreList(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]')) } catch { return new Set() }
}

export function addToIgnoreList(word: string): void {
  const list = loadIgnoreList()
  list.add(word.toLowerCase())
  try { localStorage.setItem(IGNORE_KEY, JSON.stringify(Array.from(list))) } catch { /* ignore */ }
}

/** A labelled chunk of the document, so an issue can be traced back to WHERE it appears. */
export interface SpellBlock {
  label: string   // e.g. "Intro", "Scope: Paving", "Notes"
  text: string
}

/** One place a flagged word appears: which section, plus the text either side so it's findable. */
export interface SpellOccurrence {
  label: string
  before: string   // up to ~40 chars before the word
  match: string    // the word exactly as written
  after: string    // up to ~40 chars after the word
}

export interface SpellingIssue {
  word: string
  count: number
  suggestions: string[]
  occurrences: SpellOccurrence[]
}

const CONTEXT_CHARS = 40
const MAX_OCCURRENCES = 6   // enough to locate it; don't flood the panel on a word used everywhere
const MAX_SUGGESTIONS = 6

/** A single word-context excerpt around [start, end) in text, trimmed to word boundaries. */
function excerpt(text: string, start: number, end: number): { before: string; after: string } {
  let b = Math.max(0, start - CONTEXT_CHARS)
  let a = Math.min(text.length, end + CONTEXT_CHARS)
  // Don't cut mid-word on the outer edges - back up/forward to whitespace when we clipped.
  if (b > 0) { const sp = text.indexOf(' ', b); if (sp >= 0 && sp < start) b = sp + 1 }
  if (a < text.length) { const sp = text.lastIndexOf(' ', a); if (sp > end) a = sp }
  const before = (b > 0 ? '…' : '') + text.slice(b, start).replace(/\s+/g, ' ')
  const after = text.slice(end, a).replace(/\s+/g, ' ') + (a < text.length ? '…' : '')
  return { before, after }
}

/**
 * Check labelled text blocks. Returns unknown words (deduped case-insensitively, with counts,
 * suggestions AND the labelled context of each occurrence so the user can see where each one is),
 * skipping numbers, short tokens, ALL-CAPS acronyms and the ignore list.
 *
 * Accepts plain strings too (treated as unlabelled blocks) for back-compat.
 */
export async function checkSpelling(blocks: (SpellBlock | string)[]): Promise<SpellingIssue[]> {
  const typo = await loadChecker()
  const ignore = loadIgnoreList()
  // Keyed by lower-cased word so "Hunza"/"hunza" collapse into one issue; the display keeps the
  // first spelling seen. Order preserved via `order`.
  const issues = new Map<string, SpellingIssue>()
  const order: string[] = []

  const re = /[A-Za-z][A-Za-z'’]*/g
  for (const block of blocks) {
    const label = typeof block === 'string' ? '' : block.label
    const text = typeof block === 'string' ? block : block.text
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      const raw = m[0]
      const word = raw.replace(/[’']$/, '')
      if (word.length < 3) continue
      if (word === word.toUpperCase()) continue          // acronyms (GST, LPOD, PVC)
      if (ignore.has(word.toLowerCase())) continue
      const key = word.toLowerCase()
      const existing = issues.get(key)
      if (existing) {
        existing.count++
        if (existing.occurrences.length < MAX_OCCURRENCES) {
          const { before, after } = excerpt(text, m.index, m.index + word.length)
          existing.occurrences.push({ label, before, match: word, after })
        }
        continue
      }
      if (typo.check(word) || typo.check(word.toLowerCase())) continue
      const { before, after } = excerpt(text, m.index, m.index + word.length)
      issues.set(key, {
        word,
        count: 1,
        suggestions: checker?.suggest(word, MAX_SUGGESTIONS) ?? [],
        occurrences: [{ label, before, match: word, after }],
      })
      order.push(key)
    }
  }

  return order.map(k => issues.get(k)!)
}
