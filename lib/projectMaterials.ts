// Foreman materials selection: the list of materials a project needs, where each is sourced, the
// allowance, and whether it's been confirmed (ordered/locked in). Unconfirmed materials surface in
// the cockpit Heads Up box so nothing critical gets left un-ordered.

export interface SiteMaterial {
  id: string
  type: string        // what the material is (e.g. "Bluestone paving 400x400")
  source: string      // where it can be sourced from (supplier / yard)
  allowance: number   // dollars allowed for it
  confirmed: boolean  // ordered / price locked in
}

/** A row is "real" (worth keeping/flagging) once it has a type, a source, or an allowance. */
export function isMaterialFilled(m: SiteMaterial): boolean {
  return !!(m.type.trim() || m.source.trim() || m.allowance > 0)
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
  const order: string[] = []
  for (const li of lines) {
    if (li.enabled === false) continue
    if (li.type !== 'Material' && li.crewType !== 'Material') continue
    const desc = (li.description || '').trim()
    if (!desc || have.has(desc.toLowerCase())) continue
    if (!agg.has(desc)) order.push(desc)
    agg.set(desc, (agg.get(desc) || 0) + (Number(li.total) || 0))
  }
  return order.map(desc => ({ id: genId(), type: desc, source: '', allowance: agg.get(desc) || 0, confirmed: false }))
}

/** Coerce arbitrary JSON into a clean SiteMaterial list: drops empty rows, caps length. */
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
        confirmed: o.confirmed === true,
      }
    })
    .filter(m => m.id && isMaterialFilled(m))
    .slice(0, 200)
}
