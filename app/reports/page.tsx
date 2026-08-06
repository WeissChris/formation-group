'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCurrency, toISODate } from '@/lib/utils'
import { loadLiveJobs, type LoadedLiveJobs } from '@/lib/loadLiveJobs'
import { loadProjects, loadGanttEntries, loadProgressClaims, loadProgressPaymentStages, loadEstimates } from '@/lib/storage'
import { computeUnbilledWork } from '@/lib/unbilledWork'
import { xeroSalesExtra } from '@/lib/xeroSales'
import { computeDebtors, type DebtorSummary } from '@/lib/debtors'
import { computeDisciplineConsumption, type DisciplineSummary } from '@/lib/disciplineCosts'
import { costBreakdown, activeLineItems } from '@/lib/estimateCalculations'
import type { LiveJobRow } from '@/lib/liveJobs'
import type { CloseoutRow } from '@/app/api/projects/closeouts/route'
import { PortfolioGpTrend } from '@/components/PortfolioGpTrend'

const STATUS_LABEL: Record<LiveJobRow['status'], string> = {
  on_target: 'On target', watch: 'Watch', below_target: 'Below target',
}
const STATUS_COLOR: Record<LiveJobRow['status'], string> = {
  on_target: 'text-green-600', watch: 'text-amber-500', below_target: 'text-red-500',
}

function entityLabel(e: LiveJobRow['entity']): string {
  return e === 'formation' ? 'Formation' : e === 'lume' ? 'Lume' : 'Design'
}

export default function ReportsPage() {
  const [data, setData] = useState<LoadedLiveJobs | null>(null)
  const [generatedAt, setGeneratedAt] = useState('')
  const [unbilledByProject, setUnbilledByProject] = useState<Map<string, number>>(new Map())
  const [debtors, setDebtors] = useState<DebtorSummary | null>(null)
  const [closeouts, setCloseouts] = useState<CloseoutRow[]>([])
  const [disciplines, setDisciplines] = useState<DisciplineSummary | null>(null)

  useEffect(() => {
    const todayIso = toISODate(new Date())
    loadLiveJobs().then(d => {
      setData(d)
      // Unbilled work per job - same maths as the claim prefill (planned-to-date minus invoiced).
      const map = new Map<string, number>()
      for (const r of d.rows) {
        const gantt = loadGanttEntries(r.projectId)
        if (gantt.length === 0) continue
        const claims = loadProgressClaims(r.projectId)
        const sales = (d.apiById.get(r.projectId)?.sales ?? []).map(x => ({ invoiceNumber: x.invoice_number, totalEx: x.total_ex_gst }))
        map.set(r.projectId, computeUnbilledWork(gantt, claims, todayIso, xeroSalesExtra(sales, claims)).unbilled)
      }
      setUnbilledByProject(map)
      // Portfolio cost consumption by discipline (budget from estimates, spend from Xero).
      const allEstimates = loadEstimates()
      setDisciplines(computeDisciplineConsumption(d.rows.map(r => {
        const breakdowns = allEstimates
          .filter(e => e.projectId === r.projectId && e.status === 'accepted')
          .map(e => costBreakdown(activeLineItems(e)))
        const api = d.apiById.get(r.projectId)
        return {
          budgetLabour: breakdowns.reduce((s, b) => s + b.labour, 0),
          budgetMaterials: breakdowns.reduce((s, b) => s + b.material + b.equipment, 0),
          budgetSubbies: breakdowns.reduce((s, b) => s + b.subcontractor, 0),
          actualLabour: r.hasLiveCostData ? (api?.cost_labour ?? 0) : null,
          actualMaterials: r.hasLiveCostData ? (api?.cost_materials ?? 0) : null,
          actualSubbies: r.hasLiveCostData ? (api?.cost_subbies ?? 0) : null,
          pctBilled: r.pctBilled,
          forecastRevenue: r.forecastRevenue,
        }
      })))
    })
    const projects = loadProjects()
    setDebtors(computeDebtors(
      projects,
      loadProgressClaims(),
      projects.flatMap(p => loadProgressPaymentStages(p.id)),
      todayIso,
    ))
    fetch('/api/projects/closeouts', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.closeouts) setCloseouts(d.closeouts) })
      .catch(() => {})
    setGeneratedAt(new Date().toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }))
  }, [])

  const rows = data?.rows ?? []
  const totals = data?.totals
  const belowTarget = rows.filter(r => r.status === 'below_target')

  const downloadCsv = () => {
    const header = ['Job', 'Entity', 'Contract', 'Invoiced', '% billed', 'Unbilled work', 'Cost to date', 'Forecast cost', 'Forecast GP $', 'Forecast GP %', 'Quoted %', 'Fade pts', 'Status']
    const lines = rows.map(r => [
      `"${r.projectName.replace(/"/g, '""')}"`, entityLabel(r.entity),
      r.forecastRevenue, r.invoicedToDate, r.pctBilled, unbilledByProject.get(r.projectId) ?? '', r.costToDate, r.forecastFinalCost,
      r.forecastGpDollars, r.forecastGpPct, r.quotedMarginPct, r.fadePpts, STATUS_LABEL[r.status],
    ].join(','))
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `formation-portfolio-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-light text-fg-heading">Portfolio Financial Report</h1>
          <p className="text-xs font-light text-fg-muted mt-1">
            Active jobs · Generated {generatedAt || '…'}
            {data?.lastSyncedAt && ` · Xero synced ${new Date(data.lastSyncedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Link href="/company" className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors">
            Company P&L
          </Link>
          <button onClick={downloadCsv} className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors">
            Download CSV
          </button>
          <button onClick={() => window.print()} className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-heading text-fg-heading hover:bg-fg-heading hover:text-white transition-colors">
            Print / Save PDF
          </button>
        </div>
      </div>

      {!data ? (
        <p className="text-sm font-light text-fg-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm font-light text-fg-muted">No active jobs to report.</p>
      ) : (
        <>
          {/* Portfolio summary */}
          {totals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-fg-border mb-8">
              {[
                { label: 'Active jobs', value: String(totals.jobCount) },
                { label: 'Contract value', value: formatCurrency(totals.forecastRevenue) },
                { label: 'Invoiced to date', value: formatCurrency(totals.invoicedToDate) },
                { label: 'Cost to date', value: formatCurrency(totals.costToDate) },
                { label: 'Forecast cost', value: formatCurrency(totals.forecastFinalCost) },
                { label: 'Forecast GP', value: formatCurrency(totals.forecastGpDollars) },
                { label: 'Forecast GP %', value: `${totals.forecastGpPct.toFixed(1)}%` },
                { label: 'Below target', value: `${totals.belowTargetCount} of ${totals.jobCount}` },
              ].map(t => (
                <div key={t.label} className="bg-fg-bg p-4">
                  <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{t.label}</p>
                  <p className="text-base font-light tabular-nums text-fg-heading">{t.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Portfolio GP trend from the daily snapshots */}
          <div className="mb-8">
            <PortfolioGpTrend />
          </div>

          {/* Per-job table */}
          <table className="w-full text-left border-collapse mb-8">
            <thead>
              <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                <th className="py-2 pr-3">Job</th>
                <th className="py-2 px-2 text-right">Contract</th>
                <th className="py-2 px-2 text-right">Invoiced</th>
                <th className="py-2 px-2 text-right">Unbilled</th>
                <th className="py-2 px-2 text-right">Cost to date</th>
                <th className="py-2 px-2 text-right">Forecast cost</th>
                <th className="py-2 px-2 text-right">GP %</th>
                <th className="py-2 px-2 text-right">Fade</th>
                <th className="py-2 pl-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.projectId} className="border-b border-fg-border/30">
                  <td className="py-2 pr-3">
                    <Link href={`/projects/${r.projectId}/report`} className="text-xs font-light text-fg-heading hover:underline">{r.projectName}</Link>
                    <span className="text-2xs font-light text-fg-muted ml-2">{entityLabel(r.entity)}</span>
                  </td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(r.forecastRevenue)}</td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(r.invoicedToDate)} <span className="text-2xs">({r.pctBilled.toFixed(0)}%)</span></td>
                  <td className={`py-2 px-2 text-right text-xs tabular-nums ${(unbilledByProject.get(r.projectId) ?? 0) > 0 ? 'text-amber-600' : 'text-fg-muted'}`}>
                    {unbilledByProject.has(r.projectId) ? formatCurrency(unbilledByProject.get(r.projectId)!) : '—'}
                  </td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{r.hasLiveCostData ? formatCurrency(r.costToDate) : '—'}</td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{r.hasLiveCostData ? formatCurrency(r.forecastFinalCost) : '—'}</td>
                  <td className={`py-2 px-2 text-right text-xs tabular-nums ${r.hasLiveCostData ? STATUS_COLOR[r.status] : 'text-fg-muted/40'}`}>{r.hasLiveCostData ? `${r.forecastGpPct.toFixed(1)}%` : '—'}</td>
                  <td className={`py-2 px-2 text-right text-xs tabular-nums ${r.fadePpts >= 0 ? 'text-green-600' : 'text-red-500'}`}>{r.hasLiveCostData ? `${r.fadePpts >= 0 ? '+' : ''}${r.fadePpts.toFixed(1)}` : '—'}</td>
                  <td className={`py-2 pl-2 text-right text-2xs font-medium uppercase ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Attention */}
          {belowTarget.length > 0 && (
            <div className="border border-red-200 bg-red-50/40 p-5">
              <p className="text-2xs font-semibold tracking-architectural uppercase text-red-600 mb-2">Needs attention — below target margin</p>
              <ul className="space-y-1">
                {belowTarget.map(r => (
                  <li key={r.projectId} className="text-xs font-light text-fg-heading">
                    {r.projectName} — forecast GP {r.forecastGpPct.toFixed(1)}% ({r.fadePpts.toFixed(1)} pts vs {r.quotedMarginPct.toFixed(0)}% quote)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data && !data.configured && (
            <p className="text-2xs font-light text-fg-muted/70 mt-4 no-print">Xero cost feed not configured — GP figures need a connected Xero + project mappings.</p>
          )}

          {/* Cost consumption by discipline — where the money goes vs progress */}
          {disciplines && disciplines.jobsIncluded > 0 && (
            <div className="mt-8">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Cost consumption by discipline</p>
                <p className="text-2xs font-light text-fg-muted">
                  {disciplines.jobsIncluded} job{disciplines.jobsIncluded === 1 ? '' : 's'} with live costs · portfolio {disciplines.avgPctBilled.toFixed(0)}% billed
                </p>
              </div>
              <div className="border border-fg-border divide-y divide-fg-border">
                {disciplines.rows.map(row => {
                  const hot = row.consumedPct !== null && row.consumedPct > disciplines.avgPctBilled + 10
                  return (
                    <div key={row.key} className="px-5 py-3">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-xs font-light text-fg-heading">{row.label}</span>
                        <span className="text-xs font-light tabular-nums">
                          <span className="text-fg-muted">{formatCurrency(row.actual)} of {formatCurrency(row.budget)}</span>
                          <span className={`ml-3 font-medium ${row.consumedPct === null ? 'text-fg-muted' : hot ? 'text-red-500' : 'text-fg-heading'}`}>
                            {row.consumedPct === null ? '—' : `${row.consumedPct.toFixed(0)}% used`}
                          </span>
                        </span>
                      </div>
                      <div className="relative h-1.5 bg-fg-border rounded-full overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 ${hot ? 'bg-red-400' : 'bg-fg-dark/60'}`}
                          style={{ width: `${Math.min(100, row.consumedPct ?? 0)}%` }}
                        />
                        <div className="absolute inset-y-0 w-px bg-fg-heading" style={{ left: `${Math.min(100, disciplines.avgPctBilled)}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-2xs font-light text-fg-muted/70 mt-2">
                Bar = budget consumed; marker = portfolio % billed. A discipline running well past the marker is where margin is leaking.
              </p>
            </div>
          )}

          {/* Completed jobs — quoted vs final margin, the estimating feedback loop */}
          {closeouts.length > 0 && (
            <div className="mt-8">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Completed jobs — quoted vs final</p>
                {(() => {
                  const yearAgo = new Date(); yearAgo.setFullYear(yearAgo.getFullYear() - 1)
                  const recent = closeouts.filter(c => new Date(`${c.closedAt}T00:00:00`) >= yearAgo && c.finalRevenue > 0)
                  const rev = recent.reduce((s, c) => s + c.finalRevenue, 0)
                  const gp = recent.reduce((s, c) => s + (c.finalRevenue - c.finalCost), 0)
                  return rev > 0 ? (
                    <p className="text-2xs font-light text-fg-muted">
                      Last 12 months: {recent.length} job{recent.length === 1 ? '' : 's'} · {((gp / rev) * 100).toFixed(1)}% avg final GP
                    </p>
                  ) : null
                })()}
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                    <th className="py-2 pr-3">Job</th>
                    <th className="py-2 px-2 text-right">Completed</th>
                    <th className="py-2 px-2 text-right">Final revenue</th>
                    <th className="py-2 px-2 text-right">Final cost</th>
                    <th className="py-2 px-2 text-right">Quoted GP %</th>
                    <th className="py-2 px-2 text-right">Final GP %</th>
                    <th className="py-2 pl-2 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {closeouts.map(c => {
                    const variance = c.finalGpPct - c.quotedMarginPct
                    return (
                      <tr key={c.projectId} className="border-b border-fg-border/30">
                        <td className="py-2 pr-3 text-xs font-light text-fg-heading">
                          <Link href={`/projects/${c.projectId}/report`} className="hover:underline">{c.name}</Link>
                          {c.costBasis === 'estimate' && <span className="text-2xs text-fg-muted/60 ml-2">est. cost</span>}
                        </td>
                        <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">
                          {new Date(`${c.closedAt}T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })}
                        </td>
                        <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(c.finalRevenue)}</td>
                        <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(c.finalCost)}</td>
                        <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{c.quotedMarginPct.toFixed(1)}%</td>
                        <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{c.finalGpPct.toFixed(1)}%</td>
                        <td className={`py-2 pl-2 text-right text-xs tabular-nums font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {variance >= 0 ? '+' : ''}{variance.toFixed(1)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Debtors — who owes what, and for how long */}
          {debtors && (
            <div className="mt-8">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Debtors — invoiced, not yet paid</p>
                <p className="text-2xs font-light text-fg-muted">
                  {debtors.avgDaysToPay !== null
                    ? `Clients average ${debtors.avgDaysToPay} days to pay (${debtors.paidSample} invoices, last 12m)`
                    : 'No paid-invoice history yet for days-to-pay'}
                </p>
              </div>
              {debtors.invoices.length === 0 ? (
                <div className="border border-fg-border px-5 py-4">
                  <p className="text-xs font-light text-emerald-600">&#10003; Nothing outstanding — every issued invoice is paid</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-fg-border mb-4">
                    <div className="bg-fg-bg p-4">
                      <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Total outstanding</p>
                      <p className="text-base font-light tabular-nums text-fg-heading">{formatCurrency(debtors.totalOutstanding)}</p>
                    </div>
                    {debtors.buckets.map((b, i) => (
                      <div key={b.label} className="bg-fg-bg p-4">
                        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{b.label}</p>
                        <p className={`text-base font-light tabular-nums ${b.amount > 0 && i >= 2 ? 'text-red-500' : b.amount > 0 && i === 1 ? 'text-amber-600' : 'text-fg-heading'}`}>
                          {formatCurrency(b.amount)}
                        </p>
                        <p className="text-2xs font-light text-fg-muted/70 mt-0.5">{b.count} invoice{b.count === 1 ? '' : 's'}</p>
                      </div>
                    ))}
                  </div>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                        <th className="py-2 pr-3">Invoice</th>
                        <th className="py-2 px-2">Job</th>
                        <th className="py-2 px-2">Client</th>
                        <th className="py-2 px-2 text-right">Sent</th>
                        <th className="py-2 px-2 text-right">Days out</th>
                        <th className="py-2 pl-2 text-right">Amount (ex)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debtors.invoices.map(inv => (
                        <tr key={`${inv.projectId}-${inv.invoiceNumber}`} className="border-b border-fg-border/30">
                          <td className="py-2 pr-3 text-xs font-light text-fg-heading">{inv.invoiceNumber}</td>
                          <td className="py-2 px-2 text-xs font-light text-fg-heading">
                            <Link href={`/projects/${inv.projectId}?tab=operations`} className="hover:underline">{inv.projectName}</Link>
                          </td>
                          <td className="py-2 px-2 text-xs font-light text-fg-muted">{inv.clientName || '—'}</td>
                          <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">
                            {new Date(`${inv.sentIso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          </td>
                          <td className={`py-2 px-2 text-right text-xs tabular-nums ${inv.daysOutstanding > 30 ? 'text-red-500' : inv.daysOutstanding > 14 ? 'text-amber-600' : 'text-fg-muted'}`}>
                            {inv.daysOutstanding}
                          </td>
                          <td className="py-2 pl-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(inv.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
