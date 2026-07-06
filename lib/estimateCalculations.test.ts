import { describe, it, expect } from 'vitest'
import {
  calculateLineItemRevenue,
  readLineItemRevenue,
  getMarginSummary,
  getEstimateTotals,
  getEstimateContract,
  variationContractValue,
  blendedTargetMargin,
  splitByShares,
} from './estimateCalculations'
import type { Estimate, EstimateLineItem } from '@/types'

// Helper to build a line item with sensible defaults.
function line(overrides: Partial<EstimateLineItem> = {}): EstimateLineItem {
  return {
    id: 'li-1',
    estimateId: 'est-1',
    displayOrder: '1',
    category: 'General',
    description: 'Test item',
    type: 'Material',
    units: 1,
    uom: 'ea',
    unitCost: 100,
    total: 100,
    markupPercent: 40,
    revenue: 140,
    crewType: 'Formation',
    ...overrides,
  }
}

function estimate(lineItems: EstimateLineItem[], overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: 'est-1',
    projectId: 'proj-1',
    projectName: 'Test Project',
    version: 1,
    status: 'draft',
    defaultMarkupFormation: 40,
    defaultMarkupSubcontractor: 35,
    lineItems,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('calculateLineItemRevenue', () => {
  it('derives revenue from total × (1 + markup/100)', () => {
    const item = line({ total: 100, markupPercent: 40 })
    expect(calculateLineItemRevenue(item)).toBe(140)
  })

  it('handles zero markup', () => {
    const item = line({ total: 250, markupPercent: 0 })
    expect(calculateLineItemRevenue(item)).toBe(250)
  })

  it('handles fractional markups', () => {
    const item = line({ total: 100, markupPercent: 33.33 })
    expect(calculateLineItemRevenue(item)).toBeCloseTo(133.33, 2)
  })
})

describe('readLineItemRevenue', () => {
  it('returns stored revenue when set (does not recompute)', () => {
    // Stored 200 even though total × (1+markup/100) would be 140 — the stored field wins.
    // This is the core promise: aggregations read what's persisted, not what's derivable.
    const item = line({ total: 100, markupPercent: 40, revenue: 200 })
    expect(readLineItemRevenue(item)).toBe(200)
  })

  it('falls back to calculated value when revenue is undefined (legacy rows)', () => {
    const item = line({ total: 100, markupPercent: 40 })
    // Simulate an older localStorage row that pre-dated the `revenue` field
    delete (item as Partial<EstimateLineItem>).revenue
    expect(readLineItemRevenue(item)).toBe(140)
  })

  it('returns 0 when revenue is exactly 0 (does not fall through to calc)', () => {
    const item = line({ total: 100, markupPercent: 40, revenue: 0 })
    // 0 is a valid stored value — must not trigger the legacy fallback
    expect(readLineItemRevenue(item)).toBe(0)
  })
})

describe('getMarginSummary', () => {
  it('groups by category and computes per-category margin & target', () => {
    const e = estimate([
      line({ id: 'a', category: 'Excavation', total: 1000, revenue: 1400, crewType: 'Formation' }),
      line({ id: 'b', category: 'Excavation', total: 500, revenue: 700, crewType: 'Formation' }),
      line({ id: 'c', category: 'Plumbing', total: 2000, revenue: 2680, crewType: 'Subcontractor' }),
    ])
    const summary = getMarginSummary(e)
    const excavation = summary.find(s => s.category === 'Excavation')!
    const plumbing = summary.find(s => s.category === 'Plumbing')!

    expect(excavation.totalCost).toBe(1500)
    expect(excavation.totalRevenue).toBe(2100)
    expect(excavation.crewType).toBe('Formation')
    expect(excavation.marginPercent).toBeCloseTo((2100 - 1500) / 2100, 4) // ratio 0-1
    expect(excavation.targetMargin).toBe(0.40)
    expect(excavation.meetsTarget).toBe(false) // 28.6% < 40%

    expect(plumbing.crewType).toBe('Subcontractor')
    expect(plumbing.targetMargin).toBe(0.30)   // subcontracted items: min 30% per the spreadsheet rules
    expect(plumbing.marginPercent).toBeCloseTo((2680 - 2000) / 2680, 4)
    expect(plumbing.meetsTarget).toBe(false)   // 25.4% still < 30%
  })

  it('blendedTargetMargin: cost-weights the 40/30 targets (empty -> 40)', () => {
    expect(blendedTargetMargin(1000, 0)).toBeCloseTo(0.40, 4)
    expect(blendedTargetMargin(0, 1000)).toBeCloseTo(0.30, 4)
    expect(blendedTargetMargin(1000, 1000)).toBeCloseTo(0.35, 4)
    expect(blendedTargetMargin(0, 0)).toBeCloseTo(0.40, 4)
  })

  it('uses cost-weighted blended target for mixed-crew categories', () => {
    // 1000 formation cost (target 0.40) + 1000 subcontractor cost (target 0.30)
    // blended target = 0.5 × 0.40 + 0.5 × 0.30 = 0.35
    const e = estimate([
      line({ id: 'a', category: 'Hardscape', total: 1000, revenue: 1400, crewType: 'Formation' }),
      line({ id: 'b', category: 'Hardscape', total: 1000, revenue: 1340, crewType: 'Subcontractor' }),
    ])
    const summary = getMarginSummary(e)
    expect(summary[0].crewType).toBe('Mixed')
    expect(summary[0].targetMargin).toBeCloseTo(0.35, 4)
  })

  it('returns marginPercent as a 0-1 ratio, not 0-100 percent', () => {
    // Documented contract — the dashboard and revenue page elsewhere use 0-100, but this
    // function returns ratio. Mixing scales has bitten us; pin the contract here.
    const e = estimate([line({ total: 100, revenue: 140 })])
    const summary = getMarginSummary(e)
    expect(summary[0].marginPercent).toBeLessThan(1)
    expect(summary[0].marginPercent).toBeCloseTo(0.2857, 4)
  })

  it('handles zero-revenue category without dividing by zero', () => {
    const e = estimate([line({ total: 100, revenue: 0 })])
    const summary = getMarginSummary(e)
    expect(summary[0].marginPercent).toBe(0)
    expect(summary[0].markupPercent).toBe(-1) // (0 - 100) / 100
  })

  it('folds project markups (waste/contingency) into category revenue & margin', () => {
    // 10% project markup as a % of COST (BuildXact-style), no rounding → 1400 + 10% of 1000 = 1500
    const e = estimate(
      [line({ id: 'a', category: 'Excavation', total: 1000, revenue: 1400, crewType: 'Formation' })],
      { projectMarkups: [{ id: 'm1', description: 'Waste', percent: 10 }] },
    )
    const summary = getMarginSummary(e)
    expect(summary[0].totalRevenue).toBeCloseTo(1500, 4) // 1400 + 10% of cost (1000)
    expect(summary[0].marginPercent).toBeCloseTo((1500 - 1000) / 1500, 4)
  })
})

describe('getEstimateTotals', () => {
  it('sums costs and stored revenues; applies 10% GST', () => {
    const e = estimate([
      line({ total: 1000, revenue: 1400 }),
      line({ total: 500, revenue: 700, crewType: 'Subcontractor' }),
    ])
    const totals = getEstimateTotals(e)
    expect(totals.totalCost).toBe(1500)
    expect(totals.totalRevenue).toBe(2100)
    expect(totals.gst).toBeCloseTo(210, 4)
    expect(totals.totalIncGst).toBeCloseTo(2310, 4)
  })

  it('excludes turned-off lines (enabled === false) from totals & margin', () => {
    const e = estimate([
      line({ id: 'on', total: 1000, revenue: 1400, crewType: 'Formation' }),
      line({ id: 'off', total: 500, revenue: 700, crewType: 'Formation', enabled: false }),
    ])
    const totals = getEstimateTotals(e)
    expect(totals.totalCost).toBe(1000) // the off line's 500 is excluded
    expect(totals.totalRevenue).toBe(1400) // the off line's 700 is excluded
    expect(totals.formationCost).toBe(1000)
    // a category whose only line is off should not appear in the margin summary
    const e2 = estimate([line({ id: 'x', category: 'Demo', total: 100, revenue: 140, enabled: false })])
    expect(getMarginSummary(e2)).toHaveLength(0)
  })

  it('splits cost and revenue by crewType', () => {
    const e = estimate([
      line({ total: 1000, revenue: 1400, crewType: 'Formation' }),
      line({ total: 2000, revenue: 2680, crewType: 'Subcontractor' }),
    ])
    const totals = getEstimateTotals(e)
    expect(totals.formationCost).toBe(1000)
    expect(totals.subCost).toBe(2000)
    expect(totals.formationRevenue).toBe(1400)
    expect(totals.subRevenue).toBe(2680)
  })

  it('folds project markups into the Formation/Sub revenue split', () => {
    // 10% project markup as a % of COST (BuildXact-style), no rounding.
    // lineRevenue 4080 + 10% of cost (3000) = 4380 → factor = 4380/4080
    const e = estimate(
      [
        line({ total: 1000, revenue: 1400, crewType: 'Formation' }),
        line({ total: 2000, revenue: 2680, crewType: 'Subcontractor' }),
      ],
      { projectMarkups: [{ id: 'm1', description: 'Contingency', percent: 10 }] },
    )
    const totals = getEstimateTotals(e)
    expect(totals.formationRevenue).toBeCloseTo(1500, 4) // 1400 + 10% of its own cost (1000)
    expect(totals.subRevenue).toBeCloseTo(2880, 4) // 2680 + 10% of its own cost (2000)
    // crew revenue sums to the ex-GST contract
    expect(totals.formationRevenue + totals.subRevenue).toBeCloseTo(totals.totalRevenue, 4)
  })

  it('uses readLineItemRevenue (stored field) rather than recomputing', () => {
    // Force a desync: total=100 markup=40 would compute revenue=140, but we store 999.
    // The stored value MUST win, otherwise the project page (which reads li.revenue) and
    // the estimate page (which goes through getEstimateTotals) disagree.
    const e = estimate([line({ total: 100, markupPercent: 40, revenue: 999 })])
    const totals = getEstimateTotals(e)
    expect(totals.totalRevenue).toBe(999)
  })

  it('overallMargin returns 0 when revenue is zero (no divide by zero)', () => {
    const e = estimate([line({ total: 100, revenue: 0 })])
    expect(getEstimateTotals(e).overallMargin).toBe(0)
  })

  it('does not cascade NaN when a line item has a missing total (blank row / legacy import)', () => {
    const bad = { total: undefined, revenue: undefined } as unknown as Partial<EstimateLineItem>
    const e = estimate([
      line({ id: 'a', total: 1000, revenue: 1400 }),
      line({ id: 'b', ...bad }),                       // corrupt: no total, no revenue
      line({ id: 'c', total: 500, revenue: 700, crewType: 'Subcontractor' }),
    ])
    const totals = getEstimateTotals(e)
    expect(totals.totalCost).toBe(1500)                // the missing total counts as 0
    for (const v of [totals.totalCost, totals.totalRevenue, totals.overallMargin, totals.formationCost, totals.subCost, totals.formationMargin, totals.subMargin]) {
      expect(Number.isNaN(v)).toBe(false)
    }
    // getMarginSummary must also survive the bad row
    expect(getMarginSummary(e).every(s => !Number.isNaN(s.totalCost) && !Number.isNaN(s.marginPercent))).toBe(true)
  })
})

describe('variationContractValue', () => {
  it('uses the manual variationAmount when set', () => {
    const v = estimate([line({ total: 1000, revenue: 1400 })], { parentEstimateId: 'base', variationAmount: 5000 })
    expect(variationContractValue(v)).toBe(5000)   // NOT the $1,400 line-item value
  })
  it('falls back to the line-item contract value when no variationAmount', () => {
    const v = estimate([line({ total: 1000, revenue: 1400 })], { parentEstimateId: 'base' })
    expect(variationContractValue(v)).toBe(getEstimateContract(v).exGst)
  })
})

describe('splitByShares', () => {
  it('splits proportionally to weights', () => {
    expect(splitByShares(100, [1, 3])).toEqual([25, 75])
  })
  it('sums back to EXACTLY the total (float remainder onto the last non-zero weight)', () => {
    // 256 hrs across Chris's paving example: slab prep 48, slab pour 32, materials 16, install 144, clean up 16
    const shares = splitByShares(17408.16, [48, 32, 16, 144, 16])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(17408.16)
    expect(shares[3]).toBeCloseTo(17408.16 * (144 / 256), 6)
  })
  it('ignores zero-weight entries for the remainder correction', () => {
    const shares = splitByShares(99.99, [1, 0, 2])
    expect(shares[1]).toBe(0)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(99.99)
  })
  it('splits evenly when all weights are zero', () => {
    const shares = splitByShares(90, [0, 0, 0])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(90)
    expect(shares[0]).toBeCloseTo(30, 6)
  })
  it('returns [] for no weights', () => {
    expect(splitByShares(100, [])).toEqual([])
  })
})
