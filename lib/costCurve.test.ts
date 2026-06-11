import { describe, it, expect } from 'vitest'
import { buildCostCurve, type CostPeriod } from './costCurve'

describe('buildCostCurve', () => {
  it('returns empty for no data', () => {
    expect(buildCostCurve([], [])).toEqual({ points: [], totalBudget: 0, totalActual: 0 })
  })

  it('accumulates budget + weekly supply + monthly labour into a monotonic cumulative curve', () => {
    const budget = [
      { weekEnding: '2026-06-05', scheduledCost: 1000 },
      { weekEnding: '2026-06-12', scheduledCost: 1000 },
      { weekEnding: '2026-06-19', scheduledCost: 1000 },
    ]
    const actual: CostPeriod[] = [
      { period_end: '2026-06-05', amount_ex_gst: 800, source: 'supply', grain: 'week' },
      { period_end: '2026-06-12', amount_ex_gst: 900, source: 'supply', grain: 'week' },
      { period_end: '2026-06-30', amount_ex_gst: 1200, source: 'labour', grain: 'month' },
    ]
    const { points, totalBudget, totalActual } = buildCostCurve(budget, actual)

    expect(totalBudget).toBe(3000)
    expect(totalActual).toBe(2900)
    expect(points.length).toBeGreaterThan(0)

    // every axis point is a Friday
    expect(points.every(p => new Date(`${p.weekEnding}T00:00:00`).getDay() === 5)).toBe(true)

    // cumulative series never decreases
    for (let i = 1; i < points.length; i++) {
      expect(points[i].cumBudget).toBeGreaterThanOrEqual(points[i - 1].cumBudget)
      expect(points[i].cumActual).toBeGreaterThanOrEqual(points[i - 1].cumActual)
    }

    // and reaches the totals by the end
    const last = points[points.length - 1]
    expect(last.cumBudget).toBe(3000)
    expect(last.cumActual).toBe(2900)
    expect(last.cumSupply).toBe(1700)
    expect(last.cumLabour).toBe(1200)

    // labour (month-end) lands late — it isn't counted in the first point
    expect(points[0].cumLabour).toBe(0)
  })

  it('ignores zero/blank rows', () => {
    const { totalBudget, totalActual } = buildCostCurve(
      [{ weekEnding: '2026-06-05', scheduledCost: 0 }, { weekEnding: '', scheduledCost: 500 }],
      [{ period_end: '', amount_ex_gst: 100, source: 'supply', grain: 'week' }],
    )
    expect(totalBudget).toBe(0)
    expect(totalActual).toBe(0)
  })
})
