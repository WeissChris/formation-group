import { describe, it, expect } from 'vitest'
import { computeOutstandingInvoices, stageOutstanding, claimOutstanding } from './outstandingInvoices'
import type { ProgressPaymentStage, ProgressClaim } from '@/types'

function stage(o: Partial<ProgressPaymentStage> = {}): ProgressPaymentStage {
  return { id: 's1', projectId: 'p1', stageNumber: '1', description: '', quotedAmount: 10000, paidToDate: 0, status: 'invoiced', ...o }
}
function claim(o: Partial<ProgressClaim> = {}): ProgressClaim {
  return { id: 'c1', projectId: 'p1', invoiceNumber: 'INV-1', description: '', status: 'sent', lineItems: [], comments: '', subtotalEx: 5000, gst: 500, total: 5500, roundingAdjustment: 0, createdAt: '2026-01-01' , ...o }
}

describe('stageOutstanding', () => {
  it('counts an invoiced, unpaid stage at its invoiced amount when set', () => {
    expect(stageOutstanding(stage({ quotedAmount: 10000, invoicedAmount: 9500 }))).toBe(9500)
  })
  it('falls back to the quoted amount when no override', () => {
    expect(stageOutstanding(stage({ quotedAmount: 10000 }))).toBe(10000)
  })
  it('is zero once anything is paid, or while still pending', () => {
    expect(stageOutstanding(stage({ paidToDate: 1 }))).toBe(0)
    expect(stageOutstanding(stage({ status: 'pending' }))).toBe(0)
    expect(stageOutstanding(stage({ status: 'paid' }))).toBe(0)
  })
})

describe('claimOutstanding', () => {
  it('counts a sent claim at its ex-GST subtotal', () => {
    expect(claimOutstanding(claim({ subtotalEx: 5000 }))).toBe(5000)
  })
  it('ignores draft / pending / paid claims', () => {
    expect(claimOutstanding(claim({ status: 'draft' }))).toBe(0)
    expect(claimOutstanding(claim({ status: 'pending' }))).toBe(0)
    expect(claimOutstanding(claim({ status: 'paid' }))).toBe(0)
  })
})

describe('computeOutstandingInvoices — no double counting', () => {
  it('sums disjoint projects across both models', () => {
    const r = computeOutstandingInvoices(
      [{ id: 'pool', invoiceModel: 'stage_based' }, { id: 'land', invoiceModel: 'progress_claim' }],
      [stage({ projectId: 'pool', quotedAmount: 10000 })],
      [claim({ projectId: 'land', subtotalEx: 5000 })],
    )
    expect(r.total).toBe(15000)
    expect(r.projectCount).toBe(2)
  })

  it('THE BUG: a stage-based project with a stray progress claim is NOT double-counted', () => {
    // Stage 2.1 invoiced $8,228 AND a sent claim for $8,228 on the same project → was $16,456.
    const r = computeOutstandingInvoices(
      [{ id: 'samara', invoiceModel: 'stage_based' }],
      [stage({ projectId: 'samara', quotedAmount: 8228 })],
      [claim({ projectId: 'samara', subtotalEx: 8228 })],
    )
    expect(r.total).toBe(8228)          // the stage only — its declared model wins
    expect(r.projectCount).toBe(1)
  })

  it('a progress-claim project with a stray stage counts only the claim', () => {
    const r = computeOutstandingInvoices(
      [{ id: 'job', invoiceModel: 'progress_claim' }],
      [stage({ projectId: 'job', quotedAmount: 9000 })],
      [claim({ projectId: 'job', subtotalEx: 7000 })],
    )
    expect(r.total).toBe(7000)
    expect(r.projectCount).toBe(1)
  })

  it('falls back to the other pool when the declared model has no records', () => {
    // Declared stage_based but only ever invoiced via a claim — still surfaces, not dropped.
    const r = computeOutstandingInvoices(
      [{ id: 'job', invoiceModel: 'stage_based' }],
      [],
      [claim({ projectId: 'job', subtotalEx: 4000 })],
    )
    expect(r.total).toBe(4000)
    expect(r.projectCount).toBe(1)
  })

  it('infers the model for legacy projects with none set', () => {
    const r = computeOutstandingInvoices(
      [{ id: 'old-stage' }, { id: 'old-claim' }],
      [stage({ projectId: 'old-stage', quotedAmount: 3000 })],
      [claim({ projectId: 'old-claim', subtotalEx: 2000 })],
    )
    expect(r.total).toBe(5000)
    expect(r.projectCount).toBe(2)
  })

  it('respects the invoiced-amount override in the aggregate', () => {
    const r = computeOutstandingInvoices(
      [{ id: 'pool', invoiceModel: 'stage_based' }],
      [stage({ projectId: 'pool', quotedAmount: 10000, invoicedAmount: 9500 })],
      [],
    )
    expect(r.total).toBe(9500)
  })

  it('excludes paid / pending work and empty projects', () => {
    const r = computeOutstandingInvoices(
      [{ id: 'p', invoiceModel: 'stage_based' }, { id: 'q', invoiceModel: 'progress_claim' }],
      [stage({ projectId: 'p', status: 'paid' }), stage({ projectId: 'p', status: 'pending' })],
      [claim({ projectId: 'q', status: 'paid' })],
    )
    expect(r.total).toBe(0)
    expect(r.projectCount).toBe(0)
  })
})
