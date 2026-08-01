'use client'

// Company P&L - the director-gated home of overheads, net profit and breakeven. Server data
// comes from /api/company/pnl (x-director-key checked against DIRECTOR_ACCESS_KEY), pulled
// from the whole-company Xero P&L by the cron. Everything project- and site-facing stays
// GP-only; this page is the single place NP exists.

import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { loadWeeklyRevenue } from '@/lib/storage'
import { computeCompanyBreakeven, monthStartIso, type CompanyPnlMonth } from '@/lib/companyPnl'

const KEY_STORAGE = 'fg_director_key'

const monthLabel = (monthIso: string) =>
  new Date(`${monthIso}T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })

const pct = (v: number | null) => (v === null ? '-' : `${v.toFixed(1)}%`)

export default function CompanyPnlPage() {
  const [key, setKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [months, setMonths] = useState<CompanyPnlMonth[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(KEY_STORAGE)
    if (stored) setKey(stored)
  }, [])

  const fetchMonths = async (k: string) => {
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/company/pnl', { headers: { 'x-director-key': k }, cache: 'no-store' })
      const body = await resp.json().catch(() => ({}))
      if (resp.status === 401) {
        sessionStorage.removeItem(KEY_STORAGE)
        setKey(null)
        setMonths(null)
        setError('That access key was not accepted.')
        return
      }
      if (!resp.ok) {
        setError(body.error === 'director_gate_not_configured'
          ? 'The director gate is not configured yet - set DIRECTOR_ACCESS_KEY in the Vercel environment variables and redeploy.'
          : `Could not load the company P&L: ${body.error || resp.status}`)
        return
      }
      setMonths((body.months as CompanyPnlMonth[]) || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (key) void fetchMonths(key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const unlock = () => {
    const k = keyInput.trim()
    if (!k) return
    sessionStorage.setItem(KEY_STORAGE, k)
    setKeyInput('')
    setKey(k)
  }

  const handleSync = async () => {
    if (!key) return
    setSyncing(true)
    setError('')
    try {
      const resp = await fetch('/api/company/pnl/sync', { method: 'POST', headers: { 'x-director-key': key } })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(body.error === 'no_xero_tokens'
          ? 'Xero is not connected - connect it on the Settings page first.'
          : `Sync failed: ${body.error || resp.status}`)
      }
      await fetchMonths(key)
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

  // Locked state
  if (!key) {
    return (
      <div className="max-w-[480px] mx-auto px-6 py-24">
        <h1 className="text-xl font-light text-fg-heading mb-2">Company P&L</h1>
        <p className="text-xs font-light text-fg-muted mb-6 leading-relaxed">
          Overheads, net profit and breakeven live behind a separate access key - the rest of
          the app stays gross-profit only. Enter the director access key to continue.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && unlock()}
            placeholder="Director access key"
            className="flex-1 px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors"
          />
          <button
            onClick={unlock}
            className="px-5 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
          >
            Unlock
          </button>
        </div>
        {error && <p className="text-xs font-light text-red-500 mt-3">{error}</p>}
      </div>
    )
  }

  const recent = (months ?? []).slice().sort((a, b) => b.month.localeCompare(a.month))
  const currentMonth = monthStartIso(todayIso)
  const latestComplete = recent.find(m => m.month < currentMonth && (m.revenue !== 0 || m.overheads !== 0))

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-light text-fg-heading">Company P&L - Formation Landscapes</h1>
          <p className="text-xs font-light text-fg-muted mt-1">
            Whole-company monthly figures from Xero (accrual). Director access only - project and
            site pages stay GP-only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors disabled:opacity-40"
          >
            {syncing ? 'Syncing from Xero...' : 'Sync from Xero now'}
          </button>
          <button
            onClick={() => { sessionStorage.removeItem(KEY_STORAGE); setKey(null); setMonths(null) }}
            className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading transition-colors"
          >
            Lock
          </button>
        </div>
      </div>

      {error && <p className="text-xs font-light text-red-500 mb-4">{error}</p>}

      {loading && !months ? (
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-fg-border mb-8">
              {[
                { label: 'Trailing GP % (12m)', value: pct(breakeven.trailingGpPct), sub: 'Revenue-weighted, complete months' },
                { label: 'Trailing NP % (12m)', value: pct(breakeven.trailingNpPct), sub: 'After overheads' },
                { label: 'Avg overheads / month', value: breakeven.avgMonthlyOverheads !== null ? formatCurrency(breakeven.avgMonthlyOverheads) : '-', sub: 'Last 3 complete months' },
                { label: 'Breakeven revenue / month', value: breakeven.breakevenRevenuePerMonth !== null ? formatCurrency(breakeven.breakevenRevenuePerMonth) : '-', sub: 'Overheads / trailing GP %' },
              ].map(t => (
                <div key={t.label} className="bg-fg-bg p-4">
                  <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{t.label}</p>
                  <p className="text-base font-light tabular-nums text-fg-heading">{t.value}</p>
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
