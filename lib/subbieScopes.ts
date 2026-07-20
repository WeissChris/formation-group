// Joining the two halves of "subbies" that the cockpit has always kept apart.
//
// - A SCOPE is a gantt category with subcontractor work in it. Its due date is derived live from
//   the schedule, and fg_subbie_bookings holds the foreman's booked tick + comment log against it.
// - A PACKAGE is an fg_subcontractors row: the company, the trade, the approved value, the quote.
//
// Nothing linked them, so the Subbies tab couldn't say when a company was due and the booking card
// couldn't say who was booked. This matches them: an explicit subbieId set by the foreman always
// wins; otherwise the trade and the category name are compared loosely.

export interface ScopeLike {
  category: string
  due: string
  inDays: number
  booked: boolean
  comments: { text: string; by: string; at: string }[]
  /** Explicit link stored on the booking row (migration 41). Beats any name match. */
  subbieId?: string | null
}

export interface PackageLike {
  id: string
  name: string
  trade: string
}

export interface SubbieWithScopes<P extends PackageLike, S extends ScopeLike> {
  subbie: P
  scopes: S[]
  /** True when the scopes were guessed from the trade name rather than explicitly linked. */
  suggested: boolean
}

export interface ScopeMatch<P extends PackageLike, S extends ScopeLike> {
  subbies: SubbieWithScopes<P, S>[]
  /** Scopes on the schedule with no company attached - still need booking, nobody to ring. */
  unlinked: S[]
}

/** Lowercase, strip punctuation and collapse spaces, so "Concrete - slab" ~ "concrete slab". */
export function normaliseName(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** A loose name match: identical, or one name wholly contains the other as a word run. */
export function namesMatch(a: string, b: string): boolean {
  const x = normaliseName(a), y = normaliseName(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

/**
 * Attach each scope to a subcontractor package.
 *
 * A scope with an explicit `subbieId` goes to that package and nowhere else. Everything left over
 * is offered to the first package whose trade looks like the category name. A scope that matches
 * nothing comes back in `unlinked` so the UI can prompt the foreman to pick a company.
 */
export function matchScopesToSubbies<P extends PackageLike, S extends ScopeLike>(
  scopes: S[], packages: P[],
): ScopeMatch<P, S> {
  const byId = new Map(packages.map(p => [p.id, p]))
  const assigned = new Map<string, S[]>()      // package id -> scopes
  const suggestedOnly = new Set<string>()      // package ids whose scopes are all guesses
  const unlinked: S[] = []

  for (const scope of scopes) {
    // 1. An explicit link the foreman set. Honour it even if the names look nothing alike.
    if (scope.subbieId && byId.has(scope.subbieId)) {
      const list = assigned.get(scope.subbieId) ?? []
      list.push(scope)
      assigned.set(scope.subbieId, list)
      continue
    }
    // 2. Otherwise guess from the trade name.
    const guess = packages.find(p => namesMatch(p.trade, scope.category) || namesMatch(p.name, scope.category))
    if (guess) {
      const list = assigned.get(guess.id) ?? []
      list.push(scope)
      assigned.set(guess.id, list)
      if (!assigned.get(guess.id)!.some(s => s.subbieId)) suggestedOnly.add(guess.id)
      continue
    }
    unlinked.push(scope)
  }

  const subbies = packages.map(p => ({
    subbie: p,
    scopes: (assigned.get(p.id) ?? []).slice().sort((a, b) => a.due.localeCompare(b.due)),
    suggested: suggestedOnly.has(p.id),
  }))

  return { subbies, unlinked }
}

/** The soonest unbooked scope for a package - what the tab shows as "due" on the collapsed row. */
export function nextDueScope<S extends ScopeLike>(scopes: S[]): S | null {
  const pending = scopes.filter(s => !s.booked).sort((a, b) => a.due.localeCompare(b.due))
  return pending[0] ?? scopes.slice().sort((a, b) => a.due.localeCompare(b.due))[0] ?? null
}
