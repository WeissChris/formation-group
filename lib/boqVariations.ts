// Fold accepted variations into the BOQ payload.
//
// The cockpit's estimate (scorecard allowances, BOQ tab, materials pull) came from the accepted
// BASE estimate only, so a client-approved VMO's labour hours and cost allowances never reached
// site - the crew burned variation hours against an allowance that never grew and the score
// couldn't move. This merges each accepted variation's line items into the base estimate row,
// with categories prefixed "VMO-N · ..." to match how the office gantt names variation work.
//
// Operates on RAW fg_estimates rows (snake_case columns, camelCase line items inside the jsonb)
// because that's what the /api/site BOQ route passes through; the client maps the merged row with
// the shared mapEstimate so every downstream calculation is unchanged.

type RawRow = Record<string, unknown>
type RawLine = Record<string, unknown>

/** "VMO-2 · Excavation" / "VMO-2" when the line has no category of its own. */
export function vmoCategory(variationNumber: unknown, category: unknown): string {
  const n = Number(variationNumber) || '?'
  const cat = typeof category === 'string' ? category.trim() : ''
  return cat ? `VMO-${n} · ${cat}` : `VMO-${n}`
}

/** Accepted, un-archived variations of this project, ordered by VMO number. */
export function acceptedVariations(rows: RawRow[]): RawRow[] {
  return rows
    .filter(r => r.parent_estimate_id && r.status === 'accepted' && !r.archived)
    .sort((a, b) => (Number(a.variation_number) || 0) - (Number(b.variation_number) || 0))
}

/**
 * The base estimate row with every accepted variation's line items appended (categories prefixed)
 * and their category notes carried across under the prefixed keys. Returns a new object; the
 * inputs are not mutated. A null base passes through untouched.
 */
export function mergeAcceptedVariations(base: RawRow | null, rows: RawRow[]): RawRow | null {
  if (!base) return base
  const variations = acceptedVariations(rows)
  if (variations.length === 0) return base

  const lines: RawLine[] = Array.isArray(base.line_items) ? [...(base.line_items as RawLine[])] : []
  const notes: Record<string, unknown> = { ...(base.category_notes as Record<string, unknown> ?? {}) }

  for (const v of variations) {
    for (const li of (Array.isArray(v.line_items) ? v.line_items as RawLine[] : [])) {
      lines.push({ ...li, category: vmoCategory(v.variation_number, li.category) })
    }
    for (const [cat, note] of Object.entries(v.category_notes as Record<string, unknown> ?? {})) {
      if (note) notes[vmoCategory(v.variation_number, cat)] = note
    }
  }

  return { ...base, line_items: lines, category_notes: notes }
}
