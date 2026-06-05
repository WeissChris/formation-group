// Tests for the Xero cost aggregator. The puller itself (runFullSync) is integration-level
// and would need a mocked Xero API; here we test the pure aggregation function which is
// where the GP-only guardrail lives.
//
// CRITICAL: the cost-of-sales filter is the line of defence against operating expenses
// leaking into the platform's GP view. In Xero, "Cost of Sales" = account Type === 'DIRECTCOSTS'
// (NOT Class — Class is only ASSET/EQUITY/EXPENSE/LIABILITY/REVENUE). These tests pin that.

import { describe, it, expect } from 'vitest'
import { aggregateCosts } from './xeroCostSync'

interface XeroLineItem {
  AccountCode?: string
  LineAmount?: number
  Tracking?: Array<{ TrackingCategoryID?: string; TrackingOptionID?: string }>
}
interface XeroAccount { AccountID: string; Code: string; Name: string; Class: string; Type: string }

function tx(date: string, lines: XeroLineItem[]) {
  return { date, lineItems: lines }
}

// Realistic Xero account: Class is the coarse bucket, Type is the granular kind.
// A cost-of-sales account is Class='EXPENSE', Type='DIRECTCOSTS'.
function account(code: string, name: string, cls: string, type: string): [string, XeroAccount] {
  return [code, { AccountID: `acc-${code}`, Code: code, Name: name, Class: cls, Type: type }]
}

const COGS = (code: string, name: string) => account(code, name, 'EXPENSE', 'DIRECTCOSTS')

describe('aggregateCosts — GP-only guardrail (HARD RULE)', () => {
  it('includes DIRECTCOSTS-type line items tagged to a project', () => {
    const accounts = new Map([COGS('311', 'Subcontractors')])
    const projects = new Map([['option-clifton', 'project-clifton']])
    const txs = [
      tx('/Date(1716000000000+0000)/', [{
        AccountCode: '311',
        LineAmount: 5000,
        Tracking: [{ TrackingOptionID: 'option-clifton' }],
      }]),
    ]
    const { rows } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(1)
    expect(rows[0].account_code).toBe('311')
    expect(rows[0].amount_ex_gst).toBe(5000)
  })

  it('EXCLUDES OVERHEADS/operating-expense types (must never leak into GP)', () => {
    const accounts = new Map([
      account('420', 'Director Remuneration', 'EXPENSE', 'OVERHEADS'),
      account('462', 'Rent & Outgoings', 'EXPENSE', 'OVERHEADS'),
      ...[COGS('311', 'Subcontractors')],
    ] as [string, XeroAccount][])
    const projects = new Map([['option-clifton', 'project-clifton']])
    const txs = [
      tx('/Date(1716000000000+0000)/', [
        // Even though these overheads are (wrongly) tagged to a job, the Type filter drops them.
        { AccountCode: '420', LineAmount: 20_500, Tracking: [{ TrackingOptionID: 'option-clifton' }] },
        { AccountCode: '462', LineAmount: 8_234, Tracking: [{ TrackingOptionID: 'option-clifton' }] },
        { AccountCode: '311', LineAmount: 5_000, Tracking: [{ TrackingOptionID: 'option-clifton' }] },
      ]),
    ]
    const { rows, diagnostics } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(1)
    expect(rows[0].account_code).toBe('311')
    expect(rows[0].amount_ex_gst).toBe(5_000)
    expect(rows.find(r => r.account_code === '420')).toBeUndefined()
    expect(rows.find(r => r.account_code === '462')).toBeUndefined()
    // Diagnostics still record the overheads were SEEN (tracking-matched) so we can spot
    // mis-tagging — but they weren't written.
    expect(diagnostics.lineItemsTrackingMatched).toBe(3)
    expect(diagnostics.lineItemsCostFiltered).toBe(1)
    expect(diagnostics.trackedTypeBreakdown['OVERHEADS'].count).toBe(2)
    expect(diagnostics.trackedTypeBreakdown['DIRECTCOSTS'].count).toBe(1)
  })

  it('EXCLUDES REVENUE lines (do not treat income as cost)', () => {
    const accounts = new Map([
      account('200', 'Landscaping Income', 'REVENUE', 'SALES'),
      ...[COGS('311', 'Subcontractors')],
    ] as [string, XeroAccount][])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [
      { AccountCode: '200', LineAmount: 50_000, Tracking: [{ TrackingOptionID: 'option-x' }] },
      { AccountCode: '311', LineAmount: 5_000, Tracking: [{ TrackingOptionID: 'option-x' }] },
    ])]
    const { rows } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(1)
    expect(rows[0].account_code).toBe('311')
  })

  it('EXCLUDES unknown account codes (account list might be stale or filtered)', () => {
    const accounts = new Map<string, XeroAccount>()
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [
      { AccountCode: '311', LineAmount: 5_000, Tracking: [{ TrackingOptionID: 'option-x' }] },
    ])]
    const { rows, diagnostics } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(0)
    // Tracking still matched — diagnostics record it under UNKNOWN type
    expect(diagnostics.lineItemsTrackingMatched).toBe(1)
    expect(diagnostics.trackedTypeBreakdown['UNKNOWN'].count).toBe(1)
  })
})

describe('aggregateCosts — tracking filter', () => {
  it('skips line items not tagged to any tracked project', () => {
    const accounts = new Map([COGS('311', 'Subcontractors')])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [
      { AccountCode: '311', LineAmount: 5_000, Tracking: [{ TrackingOptionID: 'option-y' }] },
      { AccountCode: '311', LineAmount: 1_000 }, // no tracking
    ])]
    const { rows, diagnostics } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(0)
    expect(diagnostics.lineItemsTrackingMatched).toBe(0)
  })

  it('matches on TrackingOptionID even with multiple tracking entries on the line', () => {
    const accounts = new Map([COGS('311', 'Subs')])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [{
      AccountCode: '311',
      LineAmount: 2_000,
      Tracking: [
        { TrackingOptionID: 'unrelated-region' },
        { TrackingOptionID: 'option-x' },
      ],
    }])]
    const { rows } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(1)
    expect(rows[0].project_id).toBe('project-x')
  })
})

describe('aggregateCosts — aggregation', () => {
  it('sums multiple line items on the same account into one rollup row', () => {
    const accounts = new Map([COGS('311', 'Subs')])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [
      tx('/Date(1716000000000+0000)/', [{ AccountCode: '311', LineAmount: 1_000, Tracking: [{ TrackingOptionID: 'option-x' }] }]),
      tx('/Date(1716500000000+0000)/', [{ AccountCode: '311', LineAmount: 2_500, Tracking: [{ TrackingOptionID: 'option-x' }] }]),
      tx('/Date(1717000000000+0000)/', [{ AccountCode: '311', LineAmount: 500,   Tracking: [{ TrackingOptionID: 'option-x' }] }]),
    ]
    const { rows } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(1)
    expect(rows[0].amount_ex_gst).toBe(4_000)
    expect(rows[0].bill_count).toBe(3)
    expect(rows[0].last_bill_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps per-project rollups separate', () => {
    const accounts = new Map([COGS('311', 'Subs')])
    const projects = new Map([
      ['option-a', 'project-a'],
      ['option-b', 'project-b'],
    ])
    const txs = [
      tx('/Date(1716000000000+0000)/', [{ AccountCode: '311', LineAmount: 1_000, Tracking: [{ TrackingOptionID: 'option-a' }] }]),
      tx('/Date(1716000000000+0000)/', [{ AccountCode: '311', LineAmount: 3_000, Tracking: [{ TrackingOptionID: 'option-b' }] }]),
    ]
    const { rows } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.project_id === 'project-a')?.amount_ex_gst).toBe(1_000)
    expect(rows.find(r => r.project_id === 'project-b')?.amount_ex_gst).toBe(3_000)
  })

  it('skips zero-amount line items', () => {
    const accounts = new Map([COGS('311', 'Subs')])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [
      { AccountCode: '311', LineAmount: 0, Tracking: [{ TrackingOptionID: 'option-x' }] },
    ])]
    const { rows } = aggregateCosts(txs, projects, accounts)
    expect(rows).toHaveLength(0)
  })
})
