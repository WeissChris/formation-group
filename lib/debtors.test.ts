import { describe, it, expect } from 'vitest'
import type { ProgressClaim, ProgressPaymentStage } from '@/types'
import { computeDebtors } from './debtors'

const proj = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, name: `Job ${id}`, clientName: `Client ${id}`, ...over })
const claim = (over: Partial<ProgressClaim>): ProgressClaim =>
  ({ id: 'c1', projectId: 'p1', invoiceNumber: 'INV-001', description: '', status: 'sent', lineItems: [],
     comments: '', subtotalEx: 10_000, gst: 1000, total: 11_000, roundingAdjustment: 0,
     createdAt: '2026-07-01T00:00:00Z', sentAt: '2026-07-01T00:00:00Z', ...over } as ProgressClaim)
const stage = (over: Partial<ProgressPaymentStage>): ProgressPaymentStage =>
  ({ id: 's1', projectId: 'p1', stageNumber: '1', description: '', quotedAmount: 20_000, paidToDate: 0,
     status: 'invoiced', invoicedDate: '2026-07-10', invoiceNumber: 'INV-100', ...over })

describe('computeDebtors', () => {
  it('ages sent unpaid claims into the right buckets, oldest first', () => {
    const d = computeDebtors(
      [proj('p1'), proj('p2')],
      [
        claim({ id: 'a', projectId: 'p1', sentAt: '2026-07-30T00:00:00Z', subtotalEx: 5000 }),   // 2 days
        claim({ id: 'b', projectId: 'p2', invoiceNumber: 'INV-002', sentAt: '2026-06-01T00:00:00Z', subtotalEx: 8000 }), // 61 days
      ],
      [], '2026-08-01')
    expect(d.totalOutstanding).toBe(13_000)
    expect(d.invoices[0].invoiceNumber).toBe('INV-002')   // oldest first
    expect(d.buckets[0].amount).toBe(5000)                // 0-14
    expect(d.buckets[3].amount).toBe(8000)                // 61+
  })

  it('paid and draft claims are not debtors', () => {
    const d = computeDebtors([proj('p1')],
      [claim({ status: 'paid', paidAt: '2026-07-20T00:00:00Z' }), claim({ id: 'c2', status: 'draft' })],
      [], '2026-08-01')
    expect(d.totalOutstanding).toBe(0)
  })

  it('a stage-based project counts its invoiced stages, not its claims (never both)', () => {
    const d = computeDebtors(
      [proj('p1', { invoiceModel: 'stage_based' })],
      [claim({})],
      [stage({ invoicedAmount: 15_000 })],
      '2026-08-01')
    expect(d.totalOutstanding).toBe(15_000)
    expect(d.invoices).toHaveLength(1)
  })

  it('avg days-to-pay from claims paid in the last 12 months', () => {
    const d = computeDebtors([proj('p1')], [
      claim({ id: 'x', status: 'paid', sentAt: '2026-07-01T00:00:00Z', paidAt: '2026-07-15T00:00:00Z' }),  // 14d
      claim({ id: 'y', status: 'paid', sentAt: '2026-06-01T00:00:00Z', paidAt: '2026-06-11T00:00:00Z' }),  // 10d
      claim({ id: 'z', status: 'paid', sentAt: '2020-01-01T00:00:00Z', paidAt: '2020-02-01T00:00:00Z' }),  // too old
    ], [], '2026-08-01')
    expect(d.avgDaysToPay).toBe(12)
    expect(d.paidSample).toBe(2)
  })

  it('null avg with no paid history', () => {
    expect(computeDebtors([proj('p1')], [], [], '2026-08-01').avgDaysToPay).toBeNull()
  })
})
