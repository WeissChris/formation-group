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

export function getEstimateTotals(estimate: Estimate) {
  const totalCost = estimate.lineItems.reduce((s, i) => s + i.total, 0)
  const totalRevenue = estimate.lineItems.reduce((s, i) => s + readLineItemRevenue(i), 0)
  const gst = totalRevenue * 0.1
  const totalIncGst = totalRevenue + gst
  const overallMargin = totalRevenue > 0 ? (totalRevenue - totalCost) / totalRevenue : 0

  const formationCost = estimate.lineItems.filter(i => i.crewType === 'Formation').reduce((s, i) => s + i.total, 0)
  const subCost = estimate.lineItems.filter(i => i.crewType === 'Subcontractor').reduce((s, i) => s + i.total, 0)
  const formationRevenue = estimate.lineItems.filter(i => i.crewType === 'Formation').reduce((s, i) => s + readLineItemRevenue(i), 0)
  const subRevenue = estimate.lineItems.filter(i => i.crewType === 'Subcontractor').reduce((s, i) => s + readLineItemRevenue(i), 0)

  return {
    totalCost,
    totalRevenue,
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
