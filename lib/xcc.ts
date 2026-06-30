// XCC (Xero cost code) default memory.
//
// "Set defaults so we're not allocating every time" — without a rules editor. It LEARNS: each time a
// line is allocated to a cost account, we remember that account for the line's category+type, so the
// next line with the same category+type auto-fills. A type-only fallback covers Labour / Subcontractor /
// Equipment (consistent per type); Material is too varied to fall back on type alone, so it only matches
// category+type. Keyed globally (across estimates), persisted in localStorage.

export type LineType = 'Material' | 'Labour' | 'Subcontractor' | 'Equipment'

const KEY = 'fg_xcc_defaults'

export function xccKey(category: string, type: LineType): string {
  return `${(category || '').trim().toLowerCase()}|${type}`
}
const typeKey = (type: LineType): string => `*|${type}`

export function loadXccDefaults(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

/** Remember `accountCode` as the default for this category+type (and, except for Material, the type). */
export function recordXccDefault(category: string, type: LineType, accountCode: string): void {
  if (typeof window === 'undefined' || !accountCode) return
  const all = loadXccDefaults()
  all[xccKey(category, type)] = accountCode
  if (type !== 'Material') all[typeKey(type)] = accountCode
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* ignore */ }
}

/** Pure resolver: exact category+type first, then the type-only fallback. Undefined if neither is known. */
export function resolveXccDefault(defaults: Record<string, string>, category: string, type: LineType): string | undefined {
  return defaults[xccKey(category, type)] || defaults[typeKey(type)] || undefined
}
