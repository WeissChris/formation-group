'use client'

// Company P&L - the home of overheads, net profit and breakeven, behind the single office
// login like the rest of the app (the separate director key was dropped at Chris's call).
// Data comes from /api/company/pnl, pulled from the whole-company Xero P&L by the cron.
// Project- and site-facing surfaces stay GP-only; this page is the single place NP exists.

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { loadWeeklyRevenue, loadProjects, loadProgressClaims, loadProgressPaymentStages } from '@/lib/storage'
import { computeCompanyBreakeven, monthStartIso, type CompanyPnlMonth } from '@/lib/companyPnl'
import { fyStartYearOf, type CompanyBudget } from '@/lib/companyBudget'
import { computeDebtors } from '@/lib/debtors'
import { computeCashflow, type CashflowWeek } from '@/lib/cashflow'

const monthLabel = (monthIso: string) =>
  new Date(`${monthIso}T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })

const pct = (v: number | null) => (v === null ? '-' : `${v.toFixed(1)}%`)

export default function CompanyPnlPage() {
  const [months, setMonths] = useState<CompanyPnlMonth[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const fetchMonths = async () => {
    setError('')
    try {
      const resp = await fetch('/api/company/pnl', { cache: 'no-store' })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(`Could not load the company P&L: ${body.error || resp.status}`)
        return
      }
      setMonths((body.months as CompanyPnlMonth[]) || [])
    } catch {
      setError('Could not load the company P&L - check the connection and reload.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void fetchMonths() }, [])

  // FY budget - only the monthly overhead budget is used here (vs actual overheads).
  const [budget, setBudget] = useState<CompanyBudget | null>(null)
  useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch(`/api/company/budget?fy=${fyStartYearOf(new Date())}`, { cache: 'no-store' })
        const body = await resp.json()
        if (body.budget) setBudget(body.budget as CompanyBudget)
      } catch { /* fine - tile shows unset */ }
    })()
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setError('')
    try {
      const resp = await fetch('/api/company/pnl/sync', { method: 'POST' })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(body.error === 'no_xero_tokens'
          ? 'Xero is not connected - connect it on the Settings page first.'
          : `Sync failed: ${body.error || resp.status}`)
      }
      await fetchMonths()
    } finally {
      setSyncing(false)
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10)
  const breakeven = useMemo(
    () => (months ? computeCompanyBreakeven(months, todayIso) : null),
    [months, todayIso],
  )

  // Forward check: Formation planned revenue for the next 3 months (this month first) vs the
  // breakeven run-rate. Planned comes from the gantt forecast rows in the revenue schedule.
  const forwardMonths = useMemo(() => {
    if (!breakeven?.breakevenRevenuePerMonth) return []
    const revenue = loadWeeklyRevenue().filter(r => r.entity === 'formation')
    const out: Array<{ monthIso: string; planned: number; short: number }> = []
    const now = new Date()
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const monthIso = monthStartIso(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
      const planned = revenue
        .filter(r => monthStartIso(r.weekEnding) === monthIso)
        .reduce((s, r) => s + r.plannedRevenue, 0)
      out.push({ monthIso, planned, short: breakeven.breakevenRevenuePerMonth - planned })
    }
    return out
  }, [breakeven])

  // 13-week cash flow: real receivables + lagged planned invoicing in; scheduled job cost +
  // overhead run-rate out. Receipt lag from actual days-to-pay history (fallback 14 days).
  const cashflow = useMemo((): { weeks: CashflowWeek[]; lagDays: number } | null => {
    if (!breakeven || breakeven.avgMonthlyOverheads === null) return null
    const projects = loadProjects()
    const debtors = computeDebtors(
      projects, loadProgressClaims(), projects.flatMap(p => loadProgressPaymentStages(p.id)), todayIso)
    const revenue = loadWeeklyRevenue()
    const lagDays = debtors.avgDaysToPay ?? 14
    const weeks = computeCashflow({
      todayIso,
      outstandingInvoices: debtors.invoices.map(i => ({ sentIso: i.sentIso, amount: i.amount })),
      plannedRevenue: revenue.map(r => ({ weekEnding: r.weekEnding, amount: r.plannedRevenue })),
      scheduledCosts: revenue.map(r => ({ weekEnding: r.weekEnding, amount: r.scheduledCost ?? 0 })),
      weeklyOverheads: (breakeven.avgMonthlyOverheads * 12) / 52,
      receiptLagDays: lagDays,
    })
    return { weeks, lagDays }
  }, [breakeven, todayIso])

  const recent = (months ?? []).slice().sort((a, b) => b.month.localeCompare(a.month))
  const currentMonth = monthStartIso(todayIso)
  const latestComplete = recent.find(m => m.month < currentMonth && (m.revenue !== 0 || m.overheads !== 0))

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-light text-fg-heading">Company P&L - Formation Landscapes</h1>
          <p className="text-xs font-light text-fg-muted mt-1">
            Whole-company monthly figures from Xero (accrual). Overheads and net profit surface
            here only - project and site pages stay GP-only.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors disabled:opacity-40"
        >
          {syncing ? 'Syncing from Xero...' : 'Sync from Xero now'}
        </button>
      </div>

      {error && <p className="text-xs font-light text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm font-light text-fg-muted">Loading...</p>
      ) : !months || months.length === 0 ? (
        <div className="border border-fg-border p-6">
          <p className="text-sm font-light text-fg-heading mb-2">No company P&L data yet.</p>
          <p className="text-xs font-light text-fg-muted leading-relaxed">
            Run the first sync (button above) to backfill the last 24 months from Xero. The cron
            then keeps it fresh twice a day. Xero must be connected on the Settings page.
          </p>
        </div>
      ) : (
        <>
          {/* Headline tiles */}
          {breakeven && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-fg-border mb-8">
              {[
                { label: 'Trailing GP % (12m)', value: pct(breakeven.trailingGpPct), sub: 'Revenue-weighted, complete months' },
                { label: 'Trailing NP % (12m)', value: pct(breakeven.trailingNpPct), sub: 'After overheads' },
                { label: 'Avg overheads / month', value: breakeven.avgMonthlyOverheads !== null ? formatCurrency(breakeven.avgMonthlyOverheads) : '-', sub: 'Last 3 complete months' },
                {
                  label: 'Overheads vs budget',
                  value: budget && budget.overheadBudgetMonthly > 0 && breakeven.avgMonthlyOverheads !== null
                    ? `${breakeven.avgMonthlyOverheads > budget.overheadBudgetMonthly ? '+' : ''}${formatCurrency(breakeven.avgMonthlyOverheads - budget.overheadBudgetMonthly)}`
                    : '-',
                  sub: budget && budget.overheadBudgetMonthly > 0
                    ? `Run-rate vs ${formatCurrency(budget.overheadBudgetMonthly)}/mo budget`
                    : 'Set a monthly budget in Settings',
                  tone: budget && budget.overheadBudgetMonthly > 0 && breakeven.avgMonthlyOverheads !== null
                    ? (breakeven.avgMonthlyOverheads > budget.overheadBudgetMonthly ? 'bad' : 'good')
                    : undefined,
                },
                { label: 'Breakeven revenue / month', value: breakeven.breakevenRevenuePerMonth !== null ? formatCurrency(breakeven.breakevenRevenuePerMonth) : '-', sub: 'Overheads / trailing GP %' },
              ].map(t => (
                <div key={t.label} className="bg-fg-bg p-4">
                  <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{t.label}</p>
                  <p className={`text-base font-light tabular-nums ${('tone' in t && t.tone) ? (t.tone === 'bad' ? 'text-red-500' : 'text-green-600') : 'text-fg-heading'}`}>{t.value}</p>
                  <p className="text-2xs font-light text-fg-muted/70 mt-0.5">{t.sub}</p>
                </div>
              ))}
            </div>
          )}

          {/* Forward months vs breakeven */}
          {forwardMonths.length > 0 && (
            <div className="border border-fg-border p-5 mb-8">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-3">
                Scheduled revenue vs breakeven - next 3 months
              </p>
              <div className="space-y-1.5">
                {forwardMonths.map(f => (
                  <div key={f.monthIso} className="flex items-baseline justify-between">
                    <span className="text-xs font-light text-fg-heading">{monthLabel(f.monthIso)}</span>
                    <span className="text-xs font-light tabular-nums">
                      <span className="text-fg-heading">{formatCurrency(f.planned)}</span>
                      <span className={`ml-3 ${f.short > 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {f.short > 0
                          ? `${formatCurrency(f.short)} below breakeven`
                          : `${formatCurrency(-f.short)} above breakeven`}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-2xs font-light text-fg-muted/70 mt-3">
                Planned Formation revenue from the gantt forecast vs the breakeven run-rate above.
              </p>
            </div>
          )}

          {/* 13-week cash flow */}
          {cashflow && (
            <div className="border border-fg-border p-5 mb-8">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-3">
                13-week cash flow
              </p>
              <div className="overflow-x-auto">
                <table className="text-left border-collapse" style={{ minWidth: 900 }}>
                  <thead>
                    <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                      <th className="py-1.5 pr-3 sticky left-0 bg-fg-bg">Week ending</th>
                      {cashflow.weeks.map(w => (
                        <th key={w.friIso} className="py-1.5 px-2 text-right whitespace-nowrap">
                          {new Date(`${w.friIso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Cash in', (w: CashflowWeek) => w.inflow, 'text-fg-heading'],
                      ['Cash out', (w: CashflowWeek) => -w.outflow, 'text-fg-muted'],
                      ['Net', (w: CashflowWeek) => w.net, ''],
                      ['Cumulative', (w: CashflowWeek) => w.cumulative, ''],
                    ] as Array<[string, (w: CashflowWeek) => number, string]>).map(([label, pick, cls]) => (
                      <tr key={label} className={`border-b border-fg-border/30 ${label === 'Cumulative' ? 'bg-fg-card/20' : ''}`}>
                        <td className="py-1.5 pr-3 text-2xs font-light uppercase tracking-wide text-fg-muted sticky left-0 bg-fg-bg whitespace-nowrap">{label}</td>
                        {cashflow.weeks.map(w => {
                          const v = pick(w)
                          const colour = cls || (v >= 0 ? 'text-green-600' : 'text-red-500')
                          return (
                            <td key={w.friIso} className={`py-1.5 px-2 text-right text-xs font-light tabular-nums whitespace-nowrap ${colour}`}>
                              {formatCurrency(v)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-2xs font-light text-fg-muted/70 mt-3">
                In: outstanding invoices + planned invoicing, both lagged by your real {cashflow.lagDays}-day average
                time-to-pay. Out: scheduled job costs from the gantt + the overhead run-rate. Ex GST, movements only -
                add your current bank balance to the cumulative line for the true position.
              </p>
            </div>
          )}

          {/* Monthly table */}
          <table className="w-full text-left border-collapse mb-8">
            <thead>
              <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                <th className="py-2 pr-3">Month</th>
                <th className="py-2 px-2 text-right">Revenue</th>
                <th className="py-2 px-2 text-right">Cost of sales</th>
                <th className="py-2 px-2 text-right">Gross profit</th>
                <th className="py-2 px-2 text-right">GP %</th>
                <th className="py-2 px-2 text-right">Overheads</th>
                <th className="py-2 px-2 text-right">Net profit</th>
                <th className="py-2 pl-2 text-right">NP %</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(m => {
                const gpPct = m.revenue > 0 ? (m.grossProfit / m.revenue) * 100 : null
                const npPct = m.revenue > 0 ? (m.netProfit / m.revenue) * 100 : null
                const isCurrent = m.month === currentMonth
                return (
                  <tr key={m.month} className={`border-b border-fg-border/30 ${isCurrent ? 'opacity-60' : ''}`}>
                    <td className="py-2 pr-3 text-xs font-light text-fg-heading">
                      {monthLabel(m.month)}
                      {isCurrent && <span className="text-2xs text-fg-muted ml-2">(in progress)</span>}
                    </td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(m.revenue)}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(m.costOfSales)}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(m.grossProfit)}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{gpPct === null ? '-' : `${gpPct.toFixed(1)}%`}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(m.overheads)}</td>
                    <td className={`py-2 px-2 text-right text-xs tabular-nums ${m.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(m.netProfit)}</td>
                    <td className={`py-2 pl-2 text-right text-xs tabular-nums ${npPct !== null && npPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>{npPct === null ? '-' : `${npPct.toFixed(1)}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Latest complete month overhead breakdown */}
          {latestComplete && Object.keys(latestComplete.overheadsByAccount).length > 0 && (
            <details className="border border-fg-border p-5">
              <summary className="text-2xs font-light tracking-architectural uppercase text-fg-muted cursor-pointer">
                Overhead breakdown - {monthLabel(latestComplete.month)} ({formatCurrency(latestComplete.overheads)})
              </summary>
              <div className="mt-3 space-y-1">
                {Object.entries(latestComplete.overheadsByAccount)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, amount]) => (
                    <div key={name} className="flex items-baseline justify-between">
                      <span className="text-xs font-light text-fg-heading">{name}</span>
                      <span className="text-xs font-light tabular-nums text-fg-muted">{formatCurrency(amount)}</span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}
