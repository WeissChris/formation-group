import { describe, it, expect } from 'vitest'
import { computeLiveJobRow, computePortfolioTotals } from './liveJobs'
import type { Project, Estimate, EstimateLineItem, ProgressClaim, ProjectBaseline } from '@/types'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    entity: 'formation',
    name: 'Test',
    address: '',
    clientName: '',
    status: 'active',
    contractValue: 100_000,
    startDate: '2026-01-01',
    plannedCompletion: '2026-06-30',
    foreman: 'CAM',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function lineItem(overrides: Partial<EstimateLineItem> = {}): EstimateLineItem {
  return {
    id: 'li1',
    estimateId: 'e1',
    displayOrder: '1',
    category: 'Test',
    description: 'X',
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

function estimate(overrides: Partial<Estimate> = {}): Estimate {
  return {
    id: 'e1',
    projectId: 'p1',
    projectName: 'Test',
    version: 1,
    status: 'accepted',
    defaultMarkupFormation: 40,
    defaultMarkupSubcontractor: 35,
    lineItems: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function claim(overrides: Partial<ProgressClaim> = {}): ProgressClaim {
  return {
    id: 'c1',
    projectId: 'p1',
    invoiceNumber: 'INV-1',
    description: '',
    status: 'sent',
    lineItems: [],
    comments: '',
    subtotalEx: 50_000,
    gst: 5000,
    total: 55_000,
    roundingAdjustment: 0,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeLiveJobRow — revenue', () => {
  it('uses revisedContract (base + variations) when accepted estimates exist', () => {
    const base = estimate({
      id: 'base',
      lineItems: [lineItem({ revenue: 100_000 })],
    })
    const variation = estimate({
      id: 'var',
      parentEstimateId: 'base',
      variationAmount: 0,
      lineItems: [lineItem({ revenue: 20_000 })],
    })
    const row = computeLiveJobRow({
      project: project(),
      acceptedEstimates: [base, variation],
      progressClaims: [],
      costToDate: null,
      forecastFinalCost: null,
    })
    expect(row.forecastRevenue).toBe(120_000)
  })

  it('falls back to project.contractValue when no accepted estimates', () => {
    const row = computeLiveJobRow({
      project: project({ contractValue: 200_000 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: null,
      forecastFinalCost: null,
    })
    expect(row.forecastRevenue).toBe(200_000)
  })

  it('prefers stored variationAmount over re-summing line items', () => {
    const base = estimate({ lineItems: [lineItem({ revenue: 100_000 })] })
    const variation = estimate({
      id: 'var',
      parentEstimateId: 'base',
      variationAmount: 30_000, // explicit override
      lineItems: [lineItem({ revenue: 999_999 })],  // would be wrong if used
    })
    const row = computeLiveJobRow({
      project: project(),
      acceptedEstimates: [base, variation],
      progressClaims: [],
      costToDate: null,
      forecastFinalCost: null,
    })
    expect(row.forecastRevenue).toBe(130_000)
  })
})

describe('computeLiveJobRow — invoicing', () => {
  it('sums sent + paid claims, ignores draft + pending', () => {
    const claims = [
      claim({ id: 'a', status: 'sent', subtotalEx: 50_000 }),
      claim({ id: 'b', status: 'paid', subtotalEx: 30_000 }),
      claim({ id: 'c', status: 'draft', subtotalEx: 100_000 }),
      claim({ id: 'd', status: 'pending', subtotalEx: 999_999 }),
    ]
    const row = computeLiveJobRow({
      project: project({ contractValue: 200_000 }),
      acceptedEstimates: [],
      progressClaims: claims,
      costToDate: null,
      forecastFinalCost: null,
    })
    expect(row.invoicedToDate).toBe(80_000)
    expect(row.pctBilled).toBe(40)
  })

  it('handles zero-revenue project without dividing by zero', () => {
    const row = computeLiveJobRow({
      project: project({ contractValue: 0 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: null,
      forecastFinalCost: null,
    })
    expect(row.pctBilled).toBe(0)
    expect(row.forecastGpPct).toBe(0)
  })
})

describe('computeLiveJobRow — cost & GP', () => {
  it('uses Xero cost when provided and computes GP correctly', () => {
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 60_000,
      forecastFinalCost: 65_000,
    })
    expect(row.costToDate).toBe(60_000)
    expect(row.forecastFinalCost).toBe(65_000)
    expect(row.forecastGpDollars).toBe(35_000)
    expect(row.forecastGpPct).toBe(35)
    expect(row.hasLiveCostData).toBe(true)
  })

  it('falls back to costToDate when forecastFinalCost is null', () => {
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 60_000,
      forecastFinalCost: null,
    })
    expect(row.forecastFinalCost).toBe(60_000)
  })

  it('treats null cost as zero with hasLiveCostData=false flag', () => {
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: null,
      forecastFinalCost: null,
    })
    expect(row.costToDate).toBe(0)
    expect(row.hasLiveCostData).toBe(false)
    expect(row.status).toBe('watch') // unmapped → neutral "watch" state
  })
})

describe('computeLiveJobRow — status (per-project target)', () => {
  it('on_target when forecastGP% is within 2ppts of target', () => {
    // 38% forecast vs 40% target → within 2ppts → green
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000, targetMarginPct: 40 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 62_000,  // GP% = 38%
      forecastFinalCost: 62_000,
    })
    expect(row.forecastGpPct).toBe(38)
    expect(row.status).toBe('on_target')
  })

  it('watch when forecastGP% is 2-10ppts below target', () => {
    // 32% forecast vs 40% target → 8 below → amber
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000, targetMarginPct: 40 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 68_000,
      forecastFinalCost: 68_000,
    })
    expect(row.status).toBe('watch')
  })

  it('below_target when forecastGP% is more than 10ppts below target', () => {
    // 20% forecast vs 40% target → 20 below → red
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000, targetMarginPct: 40 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 80_000,
      forecastFinalCost: 80_000,
    })
    expect(row.status).toBe('below_target')
  })

  it('respects per-project target — subbie-heavy at 33% target', () => {
    // Same 32% forecastGP that was 'watch' against 40% target is 'on_target' against 33%
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000, targetMarginPct: 33 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 68_000,  // GP% = 32%
      forecastFinalCost: 68_000,
    })
    expect(row.forecastGpPct).toBe(32)
    expect(row.status).toBe('on_target') // within 2ppts of 33%
  })

  it('falls back to 40% target when targetMarginPct is undefined (legacy)', () => {
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000 }), // no targetMarginPct
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 60_000,
      forecastFinalCost: 60_000,
    })
    expect(row.targetMarginPct).toBe(40)
    // 40% forecastGP vs 40% target → on_target
    expect(row.status).toBe('on_target')
  })
})

describe('computeLiveJobRow — fade', () => {
  it('computes fade from quoted baseline margin', () => {
    const baseline: ProjectBaseline = {
      capturedAt: '2026-01-01T00:00:00Z',
      contractValue: 100_000,
      costEstimate: 60_000,
      grossProfit: 40_000,
      gpPercent: 40,  // quoted at 40%
      categories: [],
    }
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000, baseline, targetMarginPct: 40 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 65_000,
      forecastFinalCost: 65_000,
    })
    expect(row.quotedMarginPct).toBe(40)
    expect(row.forecastGpPct).toBe(35)
    expect(row.fadePpts).toBe(-5) // forecastGP − quoted
  })

  it('falls back to targetMarginPct for quoted when no baseline', () => {
    const row = computeLiveJobRow({
      project: project({ contractValue: 100_000, targetMarginPct: 33 }),
      acceptedEstimates: [],
      progressClaims: [],
      costToDate: 70_000,
      forecastFinalCost: 70_000,
    })
    expect(row.quotedMarginPct).toBe(33)
  })
})

describe('computePortfolioTotals', () => {
  it('sums revenue / cost / invoiced across rows', () => {
    const rows = [
      computeLiveJobRow({
        project: project({ id: 'a', contractValue: 100_000, targetMarginPct: 40 }),
        acceptedEstimates: [],
        progressClaims: [claim({ status: 'paid', subtotalEx: 50_000 })],
        costToDate: 60_000,
        forecastFinalCost: 60_000,
      }),
      computeLiveJobRow({
        project: project({ id: 'b', contractValue: 200_000, targetMarginPct: 40 }),
        acceptedEstimates: [],
        progressClaims: [claim({ status: 'sent', subtotalEx: 80_000 })],
        costToDate: 130_000,
        forecastFinalCost: 130_000,
      }),
    ]
    const totals = computePortfolioTotals(rows)
    expect(totals.jobCount).toBe(2)
    expect(totals.forecastRevenue).toBe(300_000)
    expect(totals.invoicedToDate).toBe(130_000)
    expect(totals.costToDate).toBe(190_000)
    expect(totals.forecastFinalCost).toBe(190_000)
    expect(totals.forecastGpDollars).toBe(110_000)
    expect(totals.forecastGpPct).toBeCloseTo(36.7, 1)
  })

  it('counts status buckets correctly', () => {
    const rows = [
      computeLiveJobRow({
        project: project({ id: 'a', contractValue: 100_000, targetMarginPct: 40 }),
        acceptedEstimates: [], progressClaims: [],
        costToDate: 60_000, forecastFinalCost: 60_000, // GP = 40% → on_target
      }),
      computeLiveJobRow({
        project: project({ id: 'b', contractValue: 100_000, targetMarginPct: 40 }),
        acceptedEstimates: [], progressClaims: [],
        costToDate: 68_000, forecastFinalCost: 68_000, // GP = 32% → watch
      }),
      computeLiveJobRow({
        project: project({ id: 'c', contractValue: 100_000, targetMarginPct: 40 }),
        acceptedEstimates: [], progressClaims: [],
        costToDate: 80_000, forecastFinalCost: 80_000, // GP = 20% → below_target
      }),
    ]
    const totals = computePortfolioTotals(rows)
    expect(totals.onTargetCount).toBe(1)
    expect(totals.watchCount).toBe(1)
    expect(totals.belowTargetCount).toBe(1)
  })
})
