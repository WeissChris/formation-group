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

export interface SpellingIssue {
  word: string
  count: number
  suggestions: string[]
}

/**
 * Check a set of labelled text blocks. Returns unknown words (deduped, with counts and
 * suggestions), skipping numbers, short tokens, ALL-CAPS acronyms and the ignore list.
 */
export async function checkSpelling(texts: string[]): Promise<SpellingIssue[]> {
  const typo = await loadChecker()
  const ignore = loadIgnoreList()
  const counts = new Map<string, number>()

  for (const text of texts) {
    for (const raw of text.match(/[A-Za-z][A-Za-z'’]*/g) ?? []) {
      const word = raw.replace(/[’']$/, '')
      if (word.length < 3) continue
      if (word === word.toUpperCase()) continue          // acronyms (GST, LPOD, PVC)
      if (ignore.has(word.toLowerCase())) continue
      if (counts.has(word)) { counts.set(word, counts.get(word)! + 1); continue }
      if (typo.check(word) || typo.check(word.toLowerCase())) continue
      counts.set(word, 1)
    }
  }

  return Array.from(counts.entries()).map(([word, count]) => ({
    word,
    count,
    suggestions: (checker?.suggest(word, 3) ?? []),
  }))
}
