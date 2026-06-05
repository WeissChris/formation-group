// Tests for the Xero cost aggregator. The puller itself (runFullSync) is integration-level
// and would need a mocked Xero API; here we test the pure aggregation function which is
// where the GP-only guardrail lives.
//
// CRITICAL: the cost-of-sales filter is the line of defence against operating expenses
// leaking into the platform's GP view. In Xero, "Cost of Sales" = account Type === 'DIRECTCOSTS'
// (NOT Class — Class is only ASSET/EQUITY/EXPENSE/LIABILITY/REVENUE). These tests pin that.

import { describe, it, expect } from 'vitest'
import { aggregateCosts, parseLabourFromPnL } from './xeroCostSync'

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

  it('matches by category ID + option NAME when the option UUID is absent (real GET /Invoices shape)', () => {
    // Xero's bulk GET /Invoices returns tracking with TrackingCategoryID + Option (name) but
    // NOT TrackingOptionID. This is the path that actually fires in production.
    const accounts = new Map([COGS('311', 'Subs')])
    const byOptionId = new Map<string, string>()  // empty — no UUID available
    const byCatOptName = new Map([['cat-project|45 beach rd.', 'project-1']])
    const txs = [tx('/Date(1716000000000+0000)/', [{
      AccountCode: '311',
      LineAmount: 4_500,
      Tracking: [{ TrackingCategoryID: 'cat-project', Option: '45 Beach Rd.', Name: 'Project' } as any],
    }])]
    const { rows, diagnostics } = aggregateCosts(txs, byOptionId, accounts, byCatOptName)
    expect(rows).toHaveLength(1)
    expect(rows[0].project_id).toBe('project-1')
    expect(rows[0].amount_ex_gst).toBe(4_500)
    expect(diagnostics.lineItemsTrackingMatched).toBe(1)
  })

  it('name match is case/whitespace-insensitive', () => {
    const accounts = new Map([COGS('311', 'Subs')])
    const byCatOptName = new Map([['cat-project|165 serpells road', 'project-2']])
    const txs = [tx('/Date(1716000000000+0000)/', [{
      AccountCode: '311',
      LineAmount: 1_000,
      Tracking: [{ TrackingCategoryID: 'cat-project', Option: '  165 Serpells Road  ', Name: 'Project' } as any],
    }])]
    const { rows } = aggregateCosts(txs, new Map(), accounts, byCatOptName)
    expect(rows).toHaveLength(1)
    expect(rows[0].project_id).toBe('project-2')
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

// ── Production labour via the P&L report ─────────────────────────────────────
// Production wages + super don't appear on bills (they post via payroll), so they come from
// the Profit & Loss report broken down by the Project tracking category. CRITICAL GP-only
// guardrail: parseLabourFromPnL must emit ONLY the two named production-labour accounts — never
// income, other cost-of-sales, overheads, director comp, or the gross/net-profit summary rows.

// Two resolved labour accounts (as runFullSync resolves them from the chart of accounts).
const LABOUR_ACCOUNTS = [
  { accountId: 'lab-wages', code: '477', name: 'Wages & Salaries - Production' },
  { accountId: 'lab-super', code: '478', name: 'Superannuation - Production' },
]
// Option NAME (normalized) → projectId, matching the P&L column headers.
const PROJECT_BY_OPTION_NAME = new Map([
  ['45 beach rd.', '1'],
  ['165 serpells road', '2'],
])

/** Build a realistic Xero P&L-by-tracking report: header columns are option names, with an
 *  Income section, a Cost of Sales section (subbies + the two labour accounts), and an
 *  Operating Expenses section (director comp). A trailing "Total" column to prove it's ignored. */
function pnlReport() {
  return {
    Reports: [
      {
        Rows: [
          {
            RowType: 'Header',
            Cells: [
              { Value: '' },
              { Value: '45 Beach Rd.' },
              { Value: '165 Serpells Road' },
              { Value: 'Total' },
            ],
          },
          {
            RowType: 'Section',
            Title: 'Income',
            Rows: [
              {
                RowType: 'Row',
                Cells: [
                  { Value: 'Sales', Attributes: [{ Id: 'account', Value: 'inc-1' }] },
                  { Value: '100000.00' },
                  { Value: '200000.00' },
                  { Value: '300000.00' },
                ],
              },
            ],
          },
          {
            RowType: 'Section',
            Title: 'Less Cost of Sales',
            Rows: [
              {
                RowType: 'Row',
                Cells: [
                  { Value: 'Subcontractors', Attributes: [{ Id: 'account', Value: 'cogs-sub' }] },
                  { Value: '30000.00' },
                  { Value: '40000.00' },
                  { Value: '70000.00' },
                ],
              },
              {
                RowType: 'Row',
                Cells: [
                  { Value: 'Wages & Salaries - Production', Attributes: [{ Id: 'account', Value: 'lab-wages' }] },
                  { Value: '9,537.00' },   // thousands separator — must be parsed
                  { Value: '12000.00' },
                  { Value: '21537.00' },
                ],
              },
              {
                RowType: 'Row',
                Cells: [
                  { Value: 'Superannuation - Production', Attributes: [{ Id: 'account', Value: 'lab-super' }] },
                  { Value: '1282.00' },
                  { Value: '1500.00' },
                  { Value: '2782.00' },
                ],
              },
            ],
          },
          {
            RowType: 'Section',
            Title: 'Operating Expenses',
            Rows: [
              {
                RowType: 'Row',
                Cells: [
                  { Value: 'Director Remuneration', Attributes: [{ Id: 'account', Value: 'ovh-dir' }] },
                  { Value: '50000.00' },
                  { Value: '60000.00' },
                  { Value: '110000.00' },
                ],
              },
            ],
          },
          {
            RowType: 'SummaryRow',
            Cells: [
              { Value: 'Net Profit' },
              { Value: '9181.00' },
              { Value: '86500.00' },
              { Value: '95681.00' },
            ],
          },
        ],
      },
    ],
  }
}

describe('parseLabourFromPnL — GP-only labour from the P&L (HARD RULE)', () => {
  it('emits ONLY the two production-labour accounts, mapped to the right project columns', () => {
    const { rows } = parseLabourFromPnL(pnlReport(), LABOUR_ACCOUNTS, PROJECT_BY_OPTION_NAME, '2026-06-05')
    // 2 labour accounts × 2 mapped projects = 4 rows
    expect(rows).toHaveLength(4)

    const wagesBeach = rows.find(r => r.account_code === '477' && r.project_id === '1')
    expect(wagesBeach?.amount_ex_gst).toBe(9537)        // "9,537.00" parsed
    expect(wagesBeach?.account_name).toBe('Wages & Salaries - Production')
    expect(wagesBeach?.bill_count).toBe(0)               // payroll-derived, not a bill count
    expect(wagesBeach?.last_bill_date).toBe('2026-06-05')

    expect(rows.find(r => r.account_code === '477' && r.project_id === '2')?.amount_ex_gst).toBe(12000)
    expect(rows.find(r => r.account_code === '478' && r.project_id === '1')?.amount_ex_gst).toBe(1282)
    expect(rows.find(r => r.account_code === '478' && r.project_id === '2')?.amount_ex_gst).toBe(1500)
  })

  it('NEVER emits income, other cost-of-sales, overheads, or summary rows (GP-only)', () => {
    const { rows } = parseLabourFromPnL(pnlReport(), LABOUR_ACCOUNTS, PROJECT_BY_OPTION_NAME, '2026-06-05')
    const names = rows.map(r => r.account_name.toLowerCase())
    expect(names.some(n => n.includes('sales'))).toBe(false)
    expect(names.some(n => n.includes('subcontractor'))).toBe(false)
    expect(names.some(n => n.includes('director'))).toBe(false)
    expect(names.some(n => n.includes('net profit'))).toBe(false)
    // Every emitted row is one of the two whitelisted accounts.
    expect(rows.every(r => r.account_code === '477' || r.account_code === '478')).toBe(true)
  })

  it('ignores unmapped columns (Total / Unassigned never land against a project)', () => {
    const { rows, diag } = parseLabourFromPnL(pnlReport(), LABOUR_ACCOUNTS, PROJECT_BY_OPTION_NAME, '2026-06-05')
    expect(diag.columnsMapped).toBe(2)               // only the two project columns, not "Total"
    expect(rows.every(r => r.project_id === '1' || r.project_id === '2')).toBe(true)
  })

  it('reports per-project and total diagnostics', () => {
    const { diag } = parseLabourFromPnL(pnlReport(), LABOUR_ACCOUNTS, PROJECT_BY_OPTION_NAME, '2026-06-05')
    expect(diag.rowsWritten).toBe(4)
    expect(diag.totalAmount).toBe(24319)             // 9537 + 12000 + 1282 + 1500
    expect(diag.byProject['1']).toBe(10819)          // 9537 + 1282
    expect(diag.byProject['2']).toBe(13500)          // 12000 + 1500
    expect(diag.accountsResolved).toHaveLength(2)
  })

  it('matches by account-id attribute even when the report label differs from the CoA name', () => {
    // Report shows a different display label, but the account-id attribute identifies it.
    const report = {
      Reports: [{
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: '45 Beach Rd.' }] },
          {
            RowType: 'Section', Title: 'Less Cost of Sales', Rows: [
              {
                RowType: 'Row',
                Cells: [
                  { Value: 'Production Payroll', Attributes: [{ Id: 'account', Value: 'lab-wages' }] },
                  { Value: '5000.00' },
                ],
              },
            ],
          },
        ],
      }],
    }
    const { rows } = parseLabourFromPnL(report, LABOUR_ACCOUNTS, PROJECT_BY_OPTION_NAME, '2026-06-05')
    expect(rows).toHaveLength(1)
    // Canonicalised to the chart-of-accounts name so the reconciliation reader recognises it.
    expect(rows[0].account_name).toBe('Wages & Salaries - Production')
    expect(rows[0].account_code).toBe('477')
    expect(rows[0].amount_ex_gst).toBe(5000)
  })

  it('matches by name when the account-id attribute is absent', () => {
    const report = {
      Reports: [{
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: '45 Beach Rd.' }] },
          {
            RowType: 'Section', Title: 'Less Cost of Sales', Rows: [
              { RowType: 'Row', Cells: [{ Value: 'Superannuation - Production' }, { Value: '900.00' }] },
            ],
          },
        ],
      }],
    }
    const { rows } = parseLabourFromPnL(report, LABOUR_ACCOUNTS, PROJECT_BY_OPTION_NAME, '2026-06-05')
    expect(rows).toHaveLength(1)
    expect(rows[0].account_code).toBe('478')
    expect(rows[0].amount_ex_gst).toBe(900)
  })

  it('skips zero-value cells (no row for a project with no labour)', () => {
    const report = {
      Reports: [{
        Rows: [
          { RowType: 'Header', Cells: [{ Value: '' }, { Value: '45 Beach Rd.' }, { Value: '165 Serpells Road' }] },
          {
            RowType: 'Section', Title: 'Less Cost of Sales', Rows: [
              {
                RowType: 'Row',
                Cells: [
                  { Value: 'Wages & Salaries - Production', Attributes: [{ Id: 'account', Value: 'lab-wages' }] },
                  { Value: '0.00' },       // Beach has no labour yet → no row
                  { Value: '3000.00' },    // Serpells does
                ],
              },
            ],
          },
        ],
      }],
    }
    const { rows } = parseLabourFromPnL(report, LABOUR_ACCOUNTS, PROJECT_BY_OPTION_NAME, '2026-06-05')
    expect(rows).toHaveLength(1)
    expect(rows[0].project_id).toBe('2')
    expect(rows[0].amount_ex_gst).toBe(3000)
  })
})
