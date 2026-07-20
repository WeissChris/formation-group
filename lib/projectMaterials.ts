// Foreman materials selection: the list of materials a project needs, where each is sourced, the
// allowance, and whether it's been confirmed (ordered/locked in). Unconfirmed materials surface in
// the cockpit Heads Up box so nothing critical gets left un-ordered.

/** A quote (or any supporting file) kept against a material, in the private material-quotes bucket. */
export interface MaterialQuote {
  name: string      // original file name, shown to the foreman
  path: string      // object key inside the bucket: <projectId>/<materialId>/<file>
}

export interface SiteMaterial {
  id: string
  type: string        // what the material is (e.g. "Bluestone paving 400x400")
  source: string      // where it can be sourced from (supplier / yard)
  allowance: number   // dollars ALLOWED for it (seeded from the estimate, editable)
  actual: number      // dollars actually spent / quoted - 0 until the foreman fills it in
  notes: string       // free text - lead times, sizes, who to ask for
  quotes: MaterialQuote[]
  category?: string   // estimate category the allowance came from, when pulled from the BOQ
  confirmed: boolean  // ordered / price locked in
}

/** Per-row variance. Positive = over the allowance. Null when there is nothing to compare. */
export interface MaterialVariance {
  allowance: number
  actual: number
  diff: number        // actual - allowance
  pct: number | null  // diff as a share of the allowance; null when there is no allowance
  over: boolean
}

export function materialVariance(m: Pick<SiteMaterial, 'allowance' | 'actual'>): MaterialVariance | null {
  const allowance = Number(m.allowance) || 0
  const actual = Number(m.actual) || 0
  if (!actual) return null                       // nothing spent yet - no variance to show
  const diff = Math.round((actual - allowance) * 100) / 100
  return { allowance, actual, diff, pct: allowance > 0 ? diff / allowance : null, over: diff > 0 }
}

/** Materials that have come in over their allowance - the Heads Up flag. */
export function overspentMaterials(materials: SiteMaterial[]): SiteMaterial[] {
  return materials.filter(m => materialVariance(m)?.over)
}

/** Totals for the tab footer. */
export function materialTotals(materials: SiteMaterial[]): { allowance: number; actual: number; diff: number } {
  const allowance = materials.reduce((s, m) => s + (Number(m.allowance) || 0), 0)
  const actual = materials.reduce((s, m) => s + (Number(m.actual) || 0), 0)
  return { allowance, actual, diff: Math.round((actual - allowance) * 100) / 100 }
}

/** A row is "real" (worth keeping/flagging) once the foreman has put anything in it. */
export function isMaterialFilled(m: SiteMaterial): boolean {
  return !!(m.type.trim() || m.source.trim() || m.allowance > 0 || m.actual > 0
    || m.notes.trim() || m.quotes.length)
}

/** Unconfirmed, filled-in materials - the ones the Heads Up box flags. */
export function unconfirmedMaterials(materials: SiteMaterial[]): SiteMaterial[] {
  return materials.filter(m => isMaterialFilled(m) && !m.confirmed)
}

/** A minimal view of an estimate line item - just what seeding materials needs. */
export interface MaterialSourceLine {
  description?: string
  total?: number          // budgeted cost = the allowance
  type?: string
  crewType?: string
  category?: string       // kept so a pulled row can be traced back to its BOQ section
  enabled?: boolean
}

/**
 * Build new material rows from the estimate's Material lines: one row per distinct description with
 * its allowances summed, skipping any material already listed (case-insensitive on type). Returns
 * only the rows to APPEND, so pulling again is safe and won't duplicate.
 */
export function materialRowsFromLines(
  lines: MaterialSourceLine[], existing: SiteMaterial[], genId: () => string,
): SiteMaterial[] {
  const have = new Set(existing.map(m => m.type.trim().toLowerCase()).filter(Boolean))
  const agg = new Map<string, number>()   // description -> summed cost
  const cat = new Map<string, string>()   // description -> first category it appeared under
  const order: string[] = []
  for (const li of lines) {
    if (li.enabled === false) continue
    if (li.type !== 'Material' && li.crewType !== 'Material') continue
    const desc = (li.description || '').trim()
    if (!desc || have.has(desc.toLowerCase())) continue
    if (!agg.has(desc)) { order.push(desc); if (li.category) cat.set(desc, li.category) }
    agg.set(desc, (agg.get(desc) || 0) + (Number(li.total) || 0))
  }
  return order.map(desc => ({
    id: genId(), type: desc, source: '', allowance: agg.get(desc) || 0,
    actual: 0, notes: '', quotes: [], category: cat.get(desc), confirmed: false,
  }))
}

/** Up to this many supporting files per material - keeps the single JSONB blob small. */
export const MAX_QUOTES_PER_MATERIAL = 5

function sanitizeQuotes(raw: unknown): MaterialQuote[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((q): MaterialQuote => {
      const o = (q ?? {}) as Record<string, unknown>
      return {
        name: typeof o.name === 'string' ? o.name.slice(0, 200) : '',
        path: typeof o.path === 'string' ? o.path.slice(0, 512) : '',
      }
    })
    .filter(q => q.path)
    .slice(0, MAX_QUOTES_PER_MATERIAL)
}

/**
 * Coerce arbitrary JSON into a clean SiteMaterial list: drops empty rows, caps length.
 *
 * EVERY field must be echoed here - the POST route runs the whole list through this on every
 * autosave, so anything missing is silently stripped on the next keystroke.
 */
export function sanitizeMaterials(raw: unknown): SiteMaterial[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r): SiteMaterial => {
      const o = (r ?? {}) as Record<string, unknown>
      return {
        id: typeof o.id === 'string' && o.id ? o.id : '',
        type: typeof o.type === 'string' ? o.type : '',
        source: typeof o.source === 'string' ? o.source : '',
        allowance: Number(o.allowance) || 0,
        actual: Number(o.actual) || 0,
        notes: typeof o.notes === 'string' ? o.notes.slice(0, 2000) : '',
        quotes: sanitizeQuotes(o.quotes),
        category: typeof o.category === 'string' && o.category ? o.category : undefined,
        confirmed: o.confirmed === true,
      }
    })
    .filter(m => m.id && isMaterialFilled(m))
    .slice(0, 200)
}
