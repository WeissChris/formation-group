import { describe, it, expect } from 'vitest'
import type { Project, ProgressClaim, ProgressPaymentStage } from '@/types'
import { buildInvoicedRevenueRows, isInvoicedRevenueRow, INVOICED_TAG } from './claimRevenue'

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', entity: 'formation', name: 'Macrae', address: '', clientName: '',
  status: 'active', contractValue: 100000, startDate: '', plannedCompletion: '', foreman: '',
  ...over,
} as Project)

const claim = (over: Partial<ProgressClaim>): ProgressClaim => ({
  id: 'c1', projectId: 'p1', invoiceNumber: 'INV-001', description: '', status: 'sent',
  lineItems: [], comments: '', subtotalEx: 10000, gst: 1000, total: 11000, roundingAdjustment: 0,
  createdAt: '2026-07-27T00:00:00.000Z', sentAt: '2026-07-29T03:00:00.000Z',
  ...over,
} as ProgressClaim)

const stage = (over: Partial<ProgressPaymentStage>): ProgressPaymentStage => ({
  id: 's1', projectId: 'p1', stageNumber: '1', description: 'Deposit', quotedAmount: 20000,
  paidToDate: 0, status: 'invoiced', invoicedDate: '2026-07-28', invoiceNumber: 'INV-100',
  ...over,
})

describe('buildInvoicedRevenueRows', () => {
  it('maps a sent claim to an invoiced row in its week-ending Friday', () => {
    const rows = buildInvoicedRevenueRows(project(), [claim({})], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].weekEnding).toBe('2026-07-31')   // Wed 29 Jul -> Fri 31 Jul
    expect(rows[0].actualInvoiced).toBe(10000)      // subtotalEx, ex GST
    expect(rows[0].plannedRevenue).toBe(0)
    expect(rows[0].id).toBe('claiminv-c1')
    expect(isInvoicedRevenueRow(rows[0])).toBe(true)
  })

  it('excludes draft and pending claims', () => {
    const rows = buildInvoicedRevenueRows(project(), [
      claim({ id: 'c2', status: 'draft' }),
      claim({ id: 'c3', status: 'pending' }),
    ], [])
    expect(rows).toHaveLength(0)
  })

  it('falls back to paidAt then createdAt when sentAt is missing', () => {
    const rows = buildInvoicedRevenueRows(project(), [
      claim({ id: 'c4', status: 'paid', sentAt: undefined, paidAt: '2026-08-03T00:00:00.000Z' }),
    ], [])
    expect(rows[0].weekEnding).toBe('2026-08-07')   // Mon 3 Aug -> Fri 7 Aug
  })

  it('drops zero-amount claims', () => {
    const rows = buildInvoicedRevenueRows(project(), [claim({ subtotalEx: 0 })], [])
    expect(rows).toHaveLength(0)
  })

  it('a stage-based project uses its invoiced stages, not claims', () => {
    const rows = buildInvoicedRevenueRows(
      project({ invoiceModel: 'stage_based' }),
      [claim({})],
      [stage({ invoicedAmount: 18000 })],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('stageinv-s1')
    expect(rows[0].actualInvoiced).toBe(18000)      // actual billed beats the schedule amount
    expect(rows[0].weekEnding).toBe('2026-07-31')   // Tue 28 Jul -> Fri 31 Jul
  })

  it('a stage-based project with no invoiced stages still surfaces its claims (never double)', () => {
    const rows = buildInvoicedRevenueRows(project({ invoiceModel: 'stage_based' }), [claim({})], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('claiminv-c1')
  })

  it('skips stages that are pending or missing an invoiced date', () => {
    const rows = buildInvoicedRevenueRows(project({ invoiceModel: 'stage_based' }), [], [
      stage({ id: 's2', status: 'pending' }),
      stage({ id: 's3', invoicedDate: undefined }),
    ])
    expect(rows).toHaveLength(0)
  })

  it('tags every row so the sync can identify its own rows', () => {
    const rows = buildInvoicedRevenueRows(project(), [claim({})], [])
    expect(rows[0].notes?.endsWith(INVOICED_TAG)).toBe(true)
  })
})
