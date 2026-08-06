import { describe, it, expect } from 'vitest'
import { normInvoiceNo, unmatchedXeroSales, xeroSalesExtra } from './xeroSales'
import { aggregateSales, type XeroSalesInvoice } from './xeroSalesSync'
import type { ProgressClaim } from '@/types'

const claim = (over: Partial<ProgressClaim>): ProgressClaim => ({
  id: 'c1', projectId: 'p1', invoiceNumber: 'INV-0042', description: '', status: 'sent',
  lineItems: [], comments: '', subtotalEx: 1000, gst: 100, total: 1100, roundingAdjustment: 0,
  ...over,
} as ProgressClaim)

describe('normInvoiceNo', () => {
  it('uppercases and strips separators', () => {
    expect(normInvoiceNo('inv-0042')).toBe('INV0042')
    expect(normInvoiceNo('INV 0042')).toBe('INV0042')
    expect(normInvoiceNo(null)).toBe('')
  })
})

describe('unmatchedXeroSales / xeroSalesExtra', () => {
  it('drops sales matching a claim invoiceNumber (any claim status)', () => {
    const sales = [
      { invoiceNumber: 'INV-0042', totalEx: 1000 },
      { invoiceNumber: 'INV-0001', totalEx: 5000 },
    ]
    const claims = [claim({ invoiceNumber: 'inv 0042', status: 'draft' })]
    expect(unmatchedXeroSales(sales, claims)).toEqual([{ invoiceNumber: 'INV-0001', totalEx: 5000 }])
    expect(xeroSalesExtra(sales, claims)).toBe(5000)
  })

  it('matches by xeroInvoiceNumber too (Xero renumbers pushed drafts)', () => {
    const sales = [{ invoiceNumber: 'INV-0099', totalEx: 800 }]
    const claims = [claim({ invoiceNumber: 'PC-1', xeroInvoiceNumber: 'INV-0099' })]
    expect(xeroSalesExtra(sales, claims)).toBe(0)
  })

  it('keeps numberless sales rows (nothing to dedupe on)', () => {
    expect(xeroSalesExtra([{ invoiceNumber: null, totalEx: 750 }], [claim({})])).toBe(750)
  })

  it('handles null/empty sales', () => {
    expect(xeroSalesExtra(null, [])).toBe(0)
    expect(xeroSalesExtra([], [])).toBe(0)
  })
})

describe('aggregateSales', () => {
  const byId = new Map([['opt-1', 'proj-1']])
  const byCatName = new Map([['cat-1|45 beach rd.', 'proj-1']])
  const inv = (over: Partial<XeroSalesInvoice>): XeroSalesInvoice => ({
    InvoiceID: 'x1', InvoiceNumber: 'INV-0010', Type: 'ACCREC', Status: 'AUTHORISED', Date: '2026-07-01',
    LineItems: [{ LineAmount: 1000, Tracking: [{ TrackingOptionID: 'opt-1' }] }],
    ...over,
  })

  it('matches by option UUID and sums lines per invoice per project', () => {
    const rows = aggregateSales([inv({
      LineItems: [
        { LineAmount: 1000, Tracking: [{ TrackingOptionID: 'opt-1' }] },
        { LineAmount: 500, Tracking: [{ TrackingOptionID: 'opt-1' }] },
        { LineAmount: 99, Tracking: [] },   // untracked line drops
      ],
    })], byId, byCatName)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ invoice_id: 'x1', project_id: 'proj-1', invoice_number: 'INV-0010', total_ex_gst: 1500 })
  })

  it('matches by category id + option name when the UUID is absent (bulk GET path)', () => {
    const rows = aggregateSales([inv({
      LineItems: [{ LineAmount: 2000, Tracking: [{ TrackingCategoryID: 'cat-1', Option: '45 Beach Rd.' }] }],
    })], byId, byCatName)
    expect(rows).toHaveLength(1)
    expect(rows[0].total_ex_gst).toBe(2000)
  })

  it('drops invoices netting <= 0 and unmatched invoices', () => {
    const rows = aggregateSales([
      inv({ InvoiceID: 'neg', LineItems: [{ LineAmount: -500, Tracking: [{ TrackingOptionID: 'opt-1' }] }] }),
      inv({ InvoiceID: 'other', LineItems: [{ LineAmount: 700, Tracking: [{ TrackingOptionID: 'opt-unknown' }] }] }),
    ], byId, byCatName)
    expect(rows).toHaveLength(0)
  })

  it('parses /Date()/ dates', () => {
    const rows = aggregateSales([inv({ Date: '/Date(1751328000000+0000)/' })], byId, byCatName)
    expect(rows[0].invoice_date).toBe('2025-07-01')
  })
})
