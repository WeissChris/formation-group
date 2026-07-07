import type { LibraryItem, EstimateLineItem } from '@/types'
import { notify } from './broadcast'
import { generateId } from './utils'

export const DEFAULT_LIBRARY_ITEMS: LibraryItem[] = [
  // LABOUR
  { id: 'l1', category: 'Labour', description: 'Formation labour rate', type: 'Labour', defaultUom: 'hour', defaultUnitCost: 68, crewType: 'Formation' },

  // PRELIMINARIES
  { id: 'p1', category: 'Preliminaries', description: 'Site toilet (weekly)', type: 'Equipment', defaultUom: 'week', defaultUnitCost: 40, crewType: 'Formation' },
  { id: 'p2', category: 'Preliminaries', description: 'Hazard Co site induction', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 550, crewType: 'Subcontractor' },

  // SITE PREPARATION
  { id: 's1', category: 'Site Preparation', description: 'Machine hire', type: 'Equipment', defaultUom: 'Day', defaultUnitCost: 350, crewType: 'Formation' },
  { id: 's2', category: 'Site Preparation', description: 'Mixed heavy bin (8m³)', type: 'Material', defaultUom: 'EA', defaultUnitCost: 1200, crewType: 'Formation' },
  { id: 's3', category: 'Site Preparation', description: 'Clean fill removal', type: 'Material', defaultUom: 'm³', defaultUnitCost: 125, crewType: 'Formation' },

  // IN-SITU CONCRETE
  { id: 'c1', category: 'In-Situ Concrete', description: 'Concrete 32mpa (extended line mix)', type: 'Material', defaultUom: 'm³', defaultUnitCost: 425, crewType: 'Formation' },
  { id: 'c2', category: 'In-Situ Concrete', description: 'Concrete 25mpa', type: 'Material', defaultUom: 'm³', defaultUnitCost: 300, crewType: 'Formation' },
  { id: 'c3', category: 'In-Situ Concrete', description: 'Formwork materials', type: 'Material', defaultUom: 'Allowance', defaultUnitCost: 1000, crewType: 'Formation' },
  { id: 'c4', category: 'In-Situ Concrete', description: 'Steel mesh', type: 'Material', defaultUom: 'Allowance', defaultUnitCost: 150, crewType: 'Formation' },
  { id: 'c5', category: 'In-Situ Concrete', description: 'Sealing', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 350, crewType: 'Subcontractor' },
  { id: 'c6', category: 'In-Situ Concrete', description: 'Labour - in-situ concrete', type: 'Labour', defaultUom: 'hour', defaultUnitCost: 68, crewType: 'Formation' },

  // PAVING
  { id: 'pv1', category: 'Paving', description: 'Supply of paving', type: 'Material', defaultUom: 'm²', defaultUnitCost: 110, crewType: 'Formation' },
  { id: 'pv2', category: 'Paving', description: 'Supply of crazy paving', type: 'Material', defaultUom: 'm²', defaultUnitCost: 125, crewType: 'Formation' },
  { id: 'pv3', category: 'Paving', description: 'Paving labour', type: 'Labour', defaultUom: 'hour', defaultUnitCost: 68, crewType: 'Formation' },
  { id: 'pv4', category: 'Paving', description: 'Slab labour', type: 'Labour', defaultUom: 'hour', defaultUnitCost: 68, crewType: 'Formation' },
  { id: 'pv5', category: 'Paving', description: 'Cement 20kg GP', type: 'Material', defaultUom: 'EA', defaultUnitCost: 12, crewType: 'Formation' },
  { id: 'pv6', category: 'Paving', description: 'Grout 20kg', type: 'Material', defaultUom: 'EA', defaultUnitCost: 35, crewType: 'Formation' },
  { id: 'pv7', category: 'Paving', description: 'Bondcrete 20ltr', type: 'Material', defaultUom: 'EA', defaultUnitCost: 145, crewType: 'Formation' },
  { id: 'pv8', category: 'Paving', description: 'Wash sand', type: 'Material', defaultUom: 'm³', defaultUnitCost: 125, crewType: 'Formation' },
  { id: 'pv9', category: 'Paving', description: 'Freight', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 350, crewType: 'Subcontractor' },
  { id: 'pv10', category: 'Paving', description: 'Crush rock', type: 'Material', defaultUom: 'm³', defaultUnitCost: 100, crewType: 'Formation' },
  { id: 'pv11', category: 'Paving', description: 'F72 steel mesh', type: 'Material', defaultUom: 'sheet', defaultUnitCost: 75, crewType: 'Formation' },

  // MASONRY & FENCING
  { id: 'm1', category: 'Masonry & Fencing', description: 'N12 reo bar', type: 'Material', defaultUom: 'lm', defaultUnitCost: 1.68, crewType: 'Formation' },
  { id: 'm2', category: 'Masonry & Fencing', description: 'N16 starter bars', type: 'Material', defaultUom: 'each', defaultUnitCost: 12, crewType: 'Formation' },
  { id: 'm3', category: 'Masonry & Fencing', description: 'Supply & install blocks', type: 'Subcontractor', defaultUom: 'EA', defaultUnitCost: 20, crewType: 'Subcontractor' },
  { id: 'm4', category: 'Masonry & Fencing', description: 'Render', type: 'Subcontractor', defaultUom: 'm²', defaultUnitCost: 100, crewType: 'Subcontractor' },
  { id: 'm5', category: 'Masonry & Fencing', description: 'Steel blade fencing', type: 'Subcontractor', defaultUom: 'lm', defaultUnitCost: 1000, crewType: 'Subcontractor' },
  { id: 'm6', category: 'Masonry & Fencing', description: 'Driveway gate', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 12500, crewType: 'Subcontractor' },
  { id: 'm7', category: 'Masonry & Fencing', description: 'Labour - footings', type: 'Labour', defaultUom: 'hour', defaultUnitCost: 68, crewType: 'Formation' },

  // SOFT LANDSCAPING
  { id: 'sl1', category: 'Soft Landscaping', description: 'Premium garden soil 150mm', type: 'Material', defaultUom: 'm³', defaultUnitCost: 85, crewType: 'Formation' },
  { id: 'sl2', category: 'Soft Landscaping', description: 'Sure crop mulch 50mm', type: 'Material', defaultUom: 'm³', defaultUnitCost: 65, crewType: 'Formation' },
  { id: 'sl3', category: 'Soft Landscaping', description: 'Sir Walter buffalo lawn', type: 'Material', defaultUom: 'm²', defaultUnitCost: 22, crewType: 'Formation' },
  { id: 'sl4', category: 'Soft Landscaping', description: 'Turf sand 50mm', type: 'Material', defaultUom: 'm³', defaultUnitCost: 80, crewType: 'Formation' },
  { id: 'sl5', category: 'Soft Landscaping', description: 'Steel edging - Shapescaper', type: 'Material', defaultUom: 'lm', defaultUnitCost: 12, crewType: 'Formation' },
  { id: 'sl6', category: 'Soft Landscaping', description: 'Labour - landscaping', type: 'Labour', defaultUom: 'hour', defaultUnitCost: 68, crewType: 'Formation' },

  // IRRIGATION
  { id: 'ir1', category: 'Irrigation', description: 'Irrigation system', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 4500, crewType: 'Subcontractor' },
  { id: 'ir2', category: 'Irrigation', description: 'Irrigation labour', type: 'Labour', defaultUom: 'hour', defaultUnitCost: 68, crewType: 'Formation' },

  // LIGHTING
  { id: 'lt1', category: 'Lighting', description: 'Lighting supply & install', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 5000, crewType: 'Subcontractor' },
  { id: 'lt2', category: 'Lighting', description: 'Lighting labour', type: 'Labour', defaultUom: 'hour', defaultUnitCost: 68, crewType: 'Formation' },

  // OUTDOOR STRUCTURES
  { id: 'os1', category: 'Outdoor Structures', description: 'Timber decking supply & install', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 15000, crewType: 'Subcontractor' },
  { id: 'os2', category: 'Outdoor Structures', description: 'Pergola supply & install', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 8000, crewType: 'Subcontractor' },
  { id: 'os3', category: 'Outdoor Structures', description: 'Outdoor kitchen', type: 'Subcontractor', defaultUom: 'Allowance', defaultUnitCost: 20000, crewType: 'Subcontractor' },
]

export function loadCustomLibrary(): LibraryItem[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('fg_library') || '[]') } catch { return [] }
}

export function getAllLibraryItems(): LibraryItem[] {
  return [...DEFAULT_LIBRARY_ITEMS, ...loadCustomLibrary()]
}

export function saveCustomLibraryItem(item: LibraryItem): LibraryItem {
  // Stamp updatedAt on every save — drives cross-device newest-wins (see liveSync); notify so an
  // open item picker refreshes.
  const stamped = { ...item, updatedAt: new Date().toISOString() }
  const custom = loadCustomLibrary()
  const idx = custom.findIndex(i => i.id === stamped.id)
  if (idx >= 0) custom[idx] = stamped
  else custom.push(stamped)
  // Quota-safe: a throw must not abort the caller's Supabase write (upsertLibraryItem pushes after).
  try { localStorage.setItem('fg_library', JSON.stringify(custom)) }
  catch (e) { console.warn('saveCustomLibraryItem: local persist failed (quota?) — cloud still saves', e) }
  notify({ key: 'library' })
  return stamped
}

export function deleteCustomLibraryItem(id: string): void {
  localStorage.setItem('fg_library', JSON.stringify(loadCustomLibrary().filter(i => i.id !== id)))
  notify({ key: 'library' })
}

/** True when the id belongs to a saved (deletable) item rather than a built-in default. */
export function isCustomLibraryItem(id: string): boolean {
  return loadCustomLibrary().some(i => i.id === id)
}

/**
 * Save an estimate line item into the custom library ("Add to template" on a row). Dedupes on
 * category + description (case-insensitive): an existing custom entry is updated with the line's
 * current cost/uom/markup; a built-in default that already matches identically is left alone.
 * Returns the item to push to Supabase, or null when nothing changed.
 */
export function saveLineItemToLibrary(li: EstimateLineItem): { item: LibraryItem; outcome: 'added' | 'updated' } | null {
  const keyOf = (category: string, description: string) => `${category.trim().toLowerCase()}|${description.trim().toLowerCase()}`
  const key = keyOf(li.category, li.description)
  if (!li.description.trim()) return null

  const builtin = DEFAULT_LIBRARY_ITEMS.find(i => keyOf(i.category, i.description) === key)
  if (builtin && builtin.defaultUnitCost === li.unitCost && builtin.defaultUom === li.uom) return null

  const existing = loadCustomLibrary().find(i => keyOf(i.category, i.description) === key)
  const item: LibraryItem = {
    id: existing?.id ?? generateId(),
    category: li.category,
    ...(li.subcategory ? { subcategory: li.subcategory } : {}),
    description: li.description,
    type: li.type,
    defaultUom: li.uom,
    defaultUnitCost: li.unitCost,
    crewType: li.crewType,
    defaultMarkupPercent: li.markupPercent,
    ...(li.xeroCategory ? { xeroCategory: li.xeroCategory } : {}),
  }
  return { item: saveCustomLibraryItem(item), outcome: existing ? 'updated' : 'added' }
}

export function getCategories(): string[] {
  const all = getAllLibraryItems()
  return Array.from(new Set(all.map(i => i.category))).sort()
}

// Minimum margin the checker holds each line/category to (single source — drives getMarginSummary +
// the estimate Margin Checker cards). Per the source spreadsheet rules: subcontracted items min 30%.
export const TARGET_MARGINS = {
  Formation: 0.40,
  Subcontractor: 0.30,
}

// Default MARKUP % auto-applied to a line item by its type (Chris's per-type defaults). Note this
// is markup (on cost), distinct from the ~40% overall MARGIN target the margin checker watches.
export const DEFAULT_MARKUP_BY_TYPE: Record<LibraryItem['type'], number> = {
  Material: 45,
  Labour: 75,
  Subcontractor: 35,
  Equipment: 40,
}

export function defaultMarkupForType(type: LibraryItem['type']): number {
  return DEFAULT_MARKUP_BY_TYPE[type] ?? 40
}
