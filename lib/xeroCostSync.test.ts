// Tests for the Xero cost aggregator. The puller itself (runFullSync) is integration-level
// and would need a mocked Xero API; here we test the pure aggregation function which is
// where the GP-only guardrail lives.
//
// CRITICAL: the EXPENSE-class filter is the line of defence against operating expenses
// leaking into the platform's GP view. These tests pin that contract.

import { describe, it, expect } from 'vitest'
import { aggregateCosts } from './xeroCostSync'

// Re-declare the minimal Xero shapes here — the lib doesn't export them but we only need
// what the function takes.
interface XeroLineItem {
  AccountCode?: string
  LineAmount?: number
  Tracking?: Array<{ TrackingCategoryID?: string; TrackingOptionID?: string }>
}
interface XeroAccount { AccountID: string; Code: string; Name: string; Class: string }

function tx(date: string, lines: XeroLineItem[]) {
  return { date, lineItems: lines }
}

function account(code: string, name: string, cls: string): [string, XeroAccount] {
  return [code, { AccountID: `acc-${code}`, Code: code, Name: name, Class: cls }]
}

describe('aggregateCosts — GP-only guardrail (HARD RULE)', () => {
  it('includes DIRECTCOSTS line items', () => {
    const accounts = new Map([
      account('311', 'Subcontractors', 'DIRECTCOSTS'),
    ])
    const projects = new Map([['option-clifton', 'project-clifton']])
    const txs = [
      tx('/Date(1716000000000+0000)/', [{
        AccountCode: '311',
        LineAmount: 5000,
        Tracking: [{ TrackingOptionID: 'option-clifton' }],
      }]),
    ]
    const rollup = aggregateCosts(txs, projects, accounts)
    expect(rollup).toHaveLength(1)
    expect(rollup[0].account_code).toBe('311')
    expect(rollup[0].amount_ex_gst).toBe(5000)
  })

  it('EXCLUDES EXPENSE-class line items (operating expenses must never leak)', () => {
    const accounts = new Map([
      account('420', 'Director Remuneration', 'EXPENSE'),  // operating expense
      account('462', 'Rent & Outgoings', 'EXPENSE'),
      account('311', 'Subcontractors', 'DIRECTCOSTS'),
    ])
    const projects = new Map([['option-clifton', 'project-clifton']])
    const txs = [
      tx('/Date(1716000000000+0000)/', [
        { AccountCode: '420', LineAmount: 20_500, Tracking: [{ TrackingOptionID: 'option-clifton' }] },
        { AccountCode: '462', LineAmount: 8_234, Tracking: [{ TrackingOptionID: 'option-clifton' }] },
        { AccountCode: '311', LineAmount: 5_000, Tracking: [{ TrackingOptionID: 'option-clifton' }] },
      ]),
    ]
    const rollup = aggregateCosts(txs, projects, accounts)
    // Only the subcontractors line survives
    expect(rollup).toHaveLength(1)
    expect(rollup[0].account_code).toBe('311')
    expect(rollup[0].amount_ex_gst).toBe(5_000)
    // Critical: no row for the EXPENSE accounts
    expect(rollup.find(r => r.account_code === '420')).toBeUndefined()
    expect(rollup.find(r => r.account_code === '462')).toBeUndefined()
  })

  it('EXCLUDES REVENUE-class lines (don\'t treat income as cost)', () => {
    const accounts = new Map([
      account('200', 'Landscaping Income', 'REVENUE'),
      account('311', 'Subcontractors', 'DIRECTCOSTS'),
    ])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [
      { AccountCode: '200', LineAmount: 50_000, Tracking: [{ TrackingOptionID: 'option-x' }] },
      { AccountCode: '311', LineAmount: 5_000, Tracking: [{ TrackingOptionID: 'option-x' }] },
    ])]
    const rollup = aggregateCosts(txs, projects, accounts)
    expect(rollup).toHaveLength(1)
    expect(rollup[0].account_code).toBe('311')
  })

  it('EXCLUDES unknown account codes (account list might be stale or filtered)', () => {
    const accounts = new Map<string, XeroAccount>()  // empty — no accounts known
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [
      { AccountCode: '311', LineAmount: 5_000, Tracking: [{ TrackingOptionID: 'option-x' }] },
    ])]
    const rollup = aggregateCosts(txs, projects, accounts)
    // No data — defensive default. If we can't classify the account, don't include it.
    expect(rollup).toHaveLength(0)
  })
})

describe('aggregateCosts — tracking filter', () => {
  it('skips line items not tagged to any tracked project', () => {
    const accounts = new Map([account('311', 'Subcontractors', 'DIRECTCOSTS')])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [
      { AccountCode: '311', LineAmount: 5_000, Tracking: [{ TrackingOptionID: 'option-y' }] },
      { AccountCode: '311', LineAmount: 1_000 }, // no tracking
    ])]
    const rollup = aggregateCosts(txs, projects, accounts)
    expect(rollup).toHaveLength(0)
  })

  it('matches on TrackingOptionID even with multiple tracking entries on the line', () => {
    const accounts = new Map([account('311', 'Subs', 'DIRECTCOSTS')])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [{
      AccountCode: '311',
      LineAmount: 2_000,
      Tracking: [
        { TrackingOptionID: 'unrelated-region' }, // first tracking is something else
        { TrackingOptionID: 'option-x' },         // second is the project tag
      ],
    }])]
    const rollup = aggregateCosts(txs, projects, accounts)
    expect(rollup).toHaveLength(1)
    expect(rollup[0].project_id).toBe('project-x')
  })
})

describe('aggregateCosts — aggregation', () => {
  it('sums multiple line items on the same account into one rollup row', () => {
    const accounts = new Map([account('311', 'Subs', 'DIRECTCOSTS')])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [
      tx('/Date(1716000000000+0000)/', [{ AccountCode: '311', LineAmount: 1_000, Tracking: [{ TrackingOptionID: 'option-x' }] }]),
      tx('/Date(1716500000000+0000)/', [{ AccountCode: '311', LineAmount: 2_500, Tracking: [{ TrackingOptionID: 'option-x' }] }]),
      tx('/Date(1717000000000+0000)/', [{ AccountCode: '311', LineAmount: 500,   Tracking: [{ TrackingOptionID: 'option-x' }] }]),
    ]
    const rollup = aggregateCosts(txs, projects, accounts)
    expect(rollup).toHaveLength(1)
    expect(rollup[0].amount_ex_gst).toBe(4_000)
    expect(rollup[0].bill_count).toBe(3)
    // last_bill_date should be the most recent
    expect(rollup[0].last_bill_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps per-project rollups separate', () => {
    const accounts = new Map([account('311', 'Subs', 'DIRECTCOSTS')])
    const projects = new Map([
      ['option-a', 'project-a'],
      ['option-b', 'project-b'],
    ])
    const txs = [
      tx('/Date(1716000000000+0000)/', [{ AccountCode: '311', LineAmount: 1_000, Tracking: [{ TrackingOptionID: 'option-a' }] }]),
      tx('/Date(1716000000000+0000)/', [{ AccountCode: '311', LineAmount: 3_000, Tracking: [{ TrackingOptionID: 'option-b' }] }]),
    ]
    const rollup = aggregateCosts(txs, projects, accounts)
    expect(rollup).toHaveLength(2)
    expect(rollup.find(r => r.project_id === 'project-a')?.amount_ex_gst).toBe(1_000)
    expect(rollup.find(r => r.project_id === 'project-b')?.amount_ex_gst).toBe(3_000)
  })

  it('skips zero-amount line items', () => {
    const accounts = new Map([account('311', 'Subs', 'DIRECTCOSTS')])
    const projects = new Map([['option-x', 'project-x']])
    const txs = [tx('/Date(1716000000000+0000)/', [
      { AccountCode: '311', LineAmount: 0, Tracking: [{ TrackingOptionID: 'option-x' }] },
    ])]
    const rollup = aggregateCosts(txs, projects, accounts)
    expect(rollup).toHaveLength(0)
  })
})
