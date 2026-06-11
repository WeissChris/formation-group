'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { loadLiveJobs, type LoadedLiveJobs } from '@/lib/loadLiveJobs'
import type { LiveJobRow } from '@/lib/liveJobs'

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

  useEffect(() => {
    loadLiveJobs().then(setData)
    setGeneratedAt(new Date().toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }))
  }, [])

  const rows = data?.rows ?? []
  const totals = data?.totals
  const belowTarget = rows.filter(r => r.status === 'below_target')

  const downloadCsv = () => {
    const header = ['Job', 'Entity', 'Contract', 'Invoiced', '% billed', 'Cost to date', 'Forecast cost', 'Forecast GP $', 'Forecast GP %', 'Quoted %', 'Fade pts', 'Status']
    const lines = rows.map(r => [
      `"${r.projectName.replace(/"/g, '""')}"`, entityLabel(r.entity),
      r.forecastRevenue, r.invoicedToDate, r.pctBilled, r.costToDate, r.forecastFinalCost,
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

          {/* Per-job table */}
          <table className="w-full text-left border-collapse mb-8">
            <thead>
              <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                <th className="py-2 pr-3">Job</th>
                <th className="py-2 px-2 text-right">Contract</th>
                <th className="py-2 px-2 text-right">Invoiced</th>
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
        </>
      )}
    </div>
  )
}
