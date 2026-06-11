import type { Estimate, EstimateLineItem, CategoryMargin } from '@/types'
import { TARGET_MARGINS } from './itemLibrary'

/**
 * WRITE-time calculator — derives revenue from cost and markup.
 * Use this when constructing/editing a line item (the editor calls this and writes the result
 * to `item.revenue`).
 *
 * For READING revenue off a stored line item, use `readLineItemRevenue` instead — it returns
 * the persisted value so aggregations cannot silently drift from what's saved.
 */
export function calculateLineItemRevenue(item: EstimateLineItem): number {
  return item.total * (1 + item.markupPercent / 100)
}

/**
 * READ-time accessor — returns the stored revenue for a line item.
 *
 * Falls back to the calculated value only when `revenue` is missing (legacy localStorage rows
 * predating the field). New code should prefer this over `calculateLineItemRevenue` whenever
 * the line item came from storage.
 */
export function readLineItemRevenue(item: EstimateLineItem): number {
  return typeof item.revenue === 'number' ? item.revenue : calculateLineItemRevenue(item)
}

export function getMarginSummary(estimate: Estimate): CategoryMargin[] {
  const categories = Array.from(new Set(estimate.lineItems.map(i => i.category)))

  return categories.map(category => {
    const items = estimate.lineItems.filter(i => i.category === category)
    const totalCost = items.reduce((s, i) => s + i.total, 0)
    const totalRevenue = items.reduce((s, i) => s + readLineItemRevenue(i), 0)
    const marginPercent = totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : 0
    const markupPercent = totalCost > 0 ? (totalRevenue - totalCost) / totalCost : 0

    const formationItems = items.filter(i => i.crewType === 'Formation')
    const subItems = items.filter(i => i.crewType === 'Subcontractor')
    const crewType: 'Formation' | 'Subcontractor' | 'Mixed' =
      formationItems.length > 0 && subItems.length > 0 ? 'Mixed'
      : subItems.length > 0 ? 'Subcontractor' : 'Formation'

    // For mixed categories, use a cost-weighted blended target margin
    let targetMargin: number
    if (crewType === 'Mixed') {
      const formCost = formationItems.reduce((s, i) => s + i.total, 0)
      const subCostTotal = subItems.reduce((s, i) => s + i.total, 0)
      const totalMixed = formCost + subCostTotal
      targetMargin = totalMixed > 0
        ? (formCost / totalMixed) * TARGET_MARGINS.Formation + (subCostTotal / totalMixed) * TARGET_MARGINS.Subcontractor
        : TARGET_MARGINS.Formation
    } else {
      targetMargin = crewType === 'Subcontractor' ? TARGET_MARGINS.Subcontractor : TARGET_MARGINS.Formation
    }

    return {
      category,
      crewType,
      totalCost,
      totalRevenue,
      marginPercent,
      markupPercent,
      meetsTarget: marginPercent >= targetMargin,
      targetMargin,
    }
  })
}

/** Sum of the project-level markup percentages (waste, contingency, etc.). */
export function projectMarkupPct(estimate: Estimate): number {
  return (estimate.projectMarkups ?? []).reduce((s, m) => s + (Number(m.percent) || 0), 0)
}

/** Round to the nearest 10 / 100 / 1000 per the estimate's rounding mode (none = unchanged). */
export function roundToMode(value: number, mode?: Estimate['roundingMode']): number {
  const step = mode === 'ten' ? 10 : mode === 'hundred' ? 100 : mode === 'thousand' ? 1000 : 0
  return step > 0 ? Math.round(value / step) * step : value
}

/**
 * The estimate's ex-GST contract value: marked-up line subtotal × (1 + project markups), then
 * rounded. Returns each piece for the breakdown UI, plus `factor` (contract ÷ line revenue) used to
 * scale category budgets so the Gantt/baseline sum to the contract rather than the bare line total.
 */
export function getEstimateContract(estimate: Estimate): {
  lineRevenue: number; markupPct: number; markupAmount: number; markedUp: number; rounding: number; exGst: number; factor: number
} {
  const lineRevenue = estimate.lineItems.reduce((s, i) => s + readLineItemRevenue(i), 0)
  const markupPct = projectMarkupPct(estimate)
  const markedUp = lineRevenue * (1 + markupPct / 100)
  const exGst = roundToMode(markedUp, estimate.roundingMode)
  return {
    lineRevenue,
    markupPct,
    markupAmount: markedUp - lineRevenue,
    markedUp,
    rounding: exGst - markedUp,
    exGst,
    factor: lineRevenue > 0 ? exGst / lineRevenue : 1,
  }
}

export function getEstimateTotals(estimate: Estimate) {
  const totalCost = estimate.lineItems.reduce((s, i) => s + i.total, 0)
  const lineRevenue = estimate.lineItems.reduce((s, i) => s + readLineItemRevenue(i), 0)
  const contract = getEstimateContract(estimate)
  const totalRevenue = contract.exGst   // ex-GST contract incl project markups + rounding
  const gst = totalRevenue * 0.1
  const totalIncGst = totalRevenue + gst
  const overallMargin = totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : 0

  const formationCost = estimate.lineItems.filter(i => i.crewType === 'Formation').reduce((s, i) => s + i.total, 0)
  const subCost = estimate.lineItems.filter(i => i.crewType === 'Subcontractor').reduce((s, i) => s + i.total, 0)
  const formationRevenue = estimate.lineItems.filter(i => i.crewType === 'Formation').reduce((s, i) => s + readLineItemRevenue(i), 0)
  const subRevenue = estimate.lineItems.filter(i => i.crewType === 'Subcontractor').reduce((s, i) => s + readLineItemRevenue(i), 0)

  return {
    totalCost,
    lineRevenue,                              // sum of line revenue, before project markups
    projectMarkupPct: contract.markupPct,
    projectMarkupAmount: contract.markupAmount,
    roundingAdjustment: contract.rounding,
    totalRevenue,                             // ex-GST contract (line revenue + project markups, rounded)
    gst,
    totalIncGst,
    overallMargin,
    formationCost,
    subCost,
    formationRevenue,
    subRevenue,
    formationMargin: formationRevenue > 0 ? (formationRevenue - formationCost) / formationRevenue : 0,
    subMargin: subRevenue > 0 ? (subRevenue - subCost) / subRevenue : 0,
  }
}
