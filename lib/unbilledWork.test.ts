import { describe, it, expect } from 'vitest'
import type { GanttEntry, ProgressClaim } from '@/types'
import { computeUnbilledWork } from './unbilledWork'

const seg = (start: string, end: string, weeks: number, rev: number) =>
  ({ id: `${start}-${rev}`, startDate: start, endDate: end, weekCount: weeks, revenueAllocation: rev, costAllocation: 0 })
const entry = (over: Partial<GanttEntry>): GanttEntry => ({
  id: 'e', projectId: 'p', estimateId: 'est', category: 'Decking', crewType: 'Formation',
  budgetedRevenue: 0, budgetedCost: 0, segments: [], subtasks: [], ...over,
})
const claim = (subtotalEx: number, status: ProgressClaim['status'] = 'sent'): ProgressClaim =>
  ({ id: `c${subtotalEx}`, projectId: 'p', invoiceNumber: 'INV-1', description: '', status, lineItems: [],
     comments: '', subtotalEx, gst: 0, total: subtotalEx, roundingAdjustment: 0, createdAt: '2026-08-01T00:00:00Z' } as ProgressClaim)

// Two-week bar Mon 3 Aug - Fri 14 Aug worth 10k; "today" mid first week.
const entries = [entry({ segments: [seg('2026-08-03', '2026-08-14', 2, 10_000)] })]

describe('computeUnbilledWork', () => {
  it('earned = planned to the end of the current week', () => {
    const w = computeUnbilledWork(entries, [], '2026-08-05')
    expect(w.earnedToDate).toBeCloseTo(5000)   // first of two weeks
    expect(w.unbilled).toBeCloseTo(5000)
  })

  it('sent + paid claims reduce unbilled; drafts do not', () => {
    const w = computeUnbilledWork(entries, [claim(2000, 'sent'), claim(1000, 'paid'), claim(9999, 'draft')], '2026-08-05')
    expect(w.invoicedToDate).toBe(3000)
    expect(w.unbilled).toBeCloseTo(2000)
  })

  it('billing ahead of the work reads as overBilled, never negative unbilled', () => {
    const w = computeUnbilledWork(entries, [claim(8000)], '2026-08-05')
    expect(w.unbilled).toBe(0)
    expect(w.overBilled).toBeCloseTo(3000)
  })

  it('counts split type-line claims (entryClaimSegments invariant)', () => {
    const split = [entry({ segments: [], subtasks: [
      { id: 'lab', label: 'Labour', costType: 'labour', segments: [seg('2026-08-03', '2026-08-07', 1, 4000)] },
    ] })]
    const w = computeUnbilledWork(split, [], '2026-08-05')
    expect(w.earnedToDate).toBeCloseTo(4000)
  })
})
