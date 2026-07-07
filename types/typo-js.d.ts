// typo-js ships no TypeScript types - minimal surface we use (see lib/spellcheck.ts).
declare module 'typo-js' {
  export default class Typo {
    constructor(dictionary: string, affData?: string | null, wordsData?: string | null, settings?: Record<string, unknown>)
    check(word: string): boolean
    suggest(word: string, limit?: number): string[]
  }
}
