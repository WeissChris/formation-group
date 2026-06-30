import type { GanttEntry } from '@/types'
import { entryClaimSegments } from './ganttForecast'

// ── Gantt-phased project budget by Xero cost code ─────────────────────────────
//
// Turns the estimate's costed, XCC-allocated line items into a month-by-month budget per Xero cost
// account, using the project's Gantt to decide WHICH month each cost lands in (so the budget mirrors
// the schedule). Output feeds the Xero Budget Manager CSV.
//
// Phasing: the Gantt distributes each category's (and split type-line's) cost across the weeks it's
// scheduled. We build that month-distribution per (category, costType), then spread each line item's
// cost across those months by share, tagged with the line's XCC. A line whose category+type isn't
// scheduled (no Gantt bars) falls back to the project start month, so nothing is dropped.

export interface BudgetLineItem {
  category: string
  type: 'Material' | 'Labour' | 'Subcontractor' | 'Equipment'
  total: number          // cost (ex-markup)
  xeroCategory?: string  // the XCC account code
  enabled?: boolean
}

export interface PhasedBudget {
  /** accountCode -> monthKey('YYYY-MM') -> cost */
  budget: Record<string, Record<string, number>>
  /** all month keys that carry any cost, sorted ascending */
  months: string[]
  /** cost of enabled line items with no XCC (excluded from `budget`, surfaced for the user) */
  unallocatedCost: number
}

const TYPE_TO_COST: Record<BudgetLineItem['type'], string> = {
  Material: 'material', Labour: 'labour', Subcontractor: 'subcontractor', Equipment: 'equipment',
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** A scheduled segment's cost spread across the months of the weeks it spans (cost/weekCount per week). */
function segMonthCosts(seg: { startDate?: string; weekCount: number; costAllocation: number }): Record<string, number> {
  const out: Record<string, number> = {}
  if (!seg.startDate || seg.weekCount <= 0) return out
  const per = seg.costAllocation / seg.weekCount
  const start = new Date(`${seg.startDate}T00:00:00`)
  for (let w = 0; w < seg.weekCount; w++) {
    const d = new Date(start)
    d.setDate(d.getDate() + w * 7)
    const k = monthKey(d)
    out[k] = (out[k] || 0) + per
  }
  return out
}

function mergeInto(target: Record<string, number>, add: Record<string, number>): void {
  for (const [k, v] of Object.entries(add)) target[k] = (target[k] || 0) + v
}

/**
 * Build the phased budget. `startMonth` ('YYYY-MM') is where unscheduled line items land.
 */
export function buildPhasedBudget(lineItems: BudgetLineItem[], ganttEntries: GanttEntry[], startMonth: string): PhasedBudget {
  // Month-distribution per (category, costType) and a category-wide '__all__' (the unsplit own bar).
  const dist = new Map<string, Record<string, number>>()
  for (const entry of ganttEntries) {
    for (const { costType, seg } of entryClaimSegments(entry)) {
      const key = `${entry.category}|${costType ?? '__all__'}`
      if (!dist.has(key)) dist.set(key, {})
      mergeInto(dist.get(key)!, segMonthCosts(seg))
    }
  }

  const distributionFor = (category: string, type: BudgetLineItem['type']): Record<string, number> | null => {
    return dist.get(`${category}|${TYPE_TO_COST[type]}`) ?? dist.get(`${category}|__all__`) ?? null
  }

  const budget: Record<string, Record<string, number>> = {}
  const add = (account: string, month: string, amount: number) => {
    if (!budget[account]) budget[account] = {}
    budget[account][month] = (budget[account][month] || 0) + amount
  }

  let unallocatedCost = 0
  for (const li of lineItems) {
    if (li.enabled === false) continue
    const cost = li.total || 0
    if (cost === 0) continue
    if (!li.xeroCategory) { unallocatedCost += cost; continue }
    const d = distributionFor(li.category, li.type)
    const totalDist = d ? Object.values(d).reduce((s, v) => s + v, 0) : 0
    if (!d || totalDist <= 0) {
      add(li.xeroCategory, startMonth, cost)   // unscheduled -> project start month
    } else {
      for (const [month, mCost] of Object.entries(d)) add(li.xeroCategory, month, cost * (mCost / totalDist))
    }
  }

  const months = Array.from(new Set(Object.values(budget).flatMap(m => Object.keys(m)))).sort()
  return { budget, months, unallocatedCost }
}

/** Short month label for a 'YYYY-MM' key, e.g. '2025-07' -> 'Jul-25'. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${names[(m || 1) - 1]}-${String(y).slice(2)}`
}

/**
 * Render the phased budget as CSV: one row per cost account, a column per month, plus a Total. `name`
 * resolves an account code to its Xero name. NOTE: this is a readable accounts x months layout that
 * matches Xero's Budget Summary; the exact Budget Manager *import* template may differ (column headers /
 * account identifier) and should be confirmed against a downloaded Xero template before relying on a
 * one-click import.
 */
export function phasedBudgetToCsv(b: PhasedBudget, name: (code: string) => string): string {
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  const header = ['Account', ...b.months.map(monthLabel), 'Total']
  const rows = Object.entries(b.budget)
    .map(([code, months]) => {
      const cells = b.months.map(mk => months[mk] || 0)
      const total = cells.reduce((s, v) => s + v, 0)
      return { name: name(code), cells, total }
    })
    .sort((a, z) => z.total - a.total)
  const lines = [header.map(esc).join(',')]
  for (const r of rows) {
    lines.push([esc(r.name), ...r.cells.map(v => v.toFixed(2)), r.total.toFixed(2)].join(','))
  }
  return lines.join('\n')
}
