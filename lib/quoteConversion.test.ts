import { describe, it, expect } from 'vitest'
import type { Estimate } from '@/types'
import { computeQuoteConversion } from './quoteConversion'

const est = (over: Partial<Estimate>): Estimate => ({
  id: 'e1', projectId: 'p1', projectName: 'Test', version: 1, status: 'sent',
  defaultMarkupFormation: 40, defaultMarkupSubcontractor: 35,
  lineItems: [{ id: 'li', estimateId: 'e1', displayOrder: '1', category: 'X', description: '', type: 'Material',
    units: 1, uom: 'ea', unitCost: 50_000, total: 50_000, markupPercent: 100, revenue: 100_000, crewType: 'Formation' }],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  sentAt: '2026-06-01T00:00:00Z',
  ...over,
} as Estimate)

describe('computeQuoteConversion', () => {
  it('counts wins, losses and pending with value weighting', () => {
    const q = computeQuoteConversion([
      est({ id: 'a', status: 'accepted', acceptedAt: '2026-06-08T00:00:00Z' }),
      est({ id: 'b', declinedAt: '2026-06-15T00:00:00Z' }),
      est({ id: 'c' }),   // still pending
    ], '2026-08-01')
    expect(q.sentCount).toBe(3)
    expect(q.acceptedCount).toBe(1)
    expect(q.declinedCount).toBe(1)
    expect(q.pendingCount).toBe(1)
    expect(q.winRatePct).toBe(50)                 // 1 of 2 decided
    expect(q.valueConversionPct).toBeCloseTo(33.3, 0)
    expect(q.avgDaysToDecision).toBe(11)          // (7 + 14) / 2, rounded
  })

  it('ignores variations and quotes sent outside the window', () => {
    const q = computeQuoteConversion([
      est({ id: 'v', parentEstimateId: 'base', status: 'accepted', acceptedAt: '2026-06-02T00:00:00Z' }),
      est({ id: 'old', sentAt: '2024-01-01T00:00:00Z', status: 'accepted', acceptedAt: '2024-02-01T00:00:00Z' }),
    ], '2026-08-01')
    expect(q.sentCount).toBe(0)
    expect(q.winRatePct).toBeNull()
  })

  it('never-sent estimates are invisible to the funnel', () => {
    const q = computeQuoteConversion([est({ sentAt: undefined })], '2026-08-01')
    expect(q.sentCount).toBe(0)
  })
})
