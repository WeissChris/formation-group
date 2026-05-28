'use client'

import Link from 'next/link'
import type { LiveJobRow, PortfolioTotals } from '@/lib/liveJobs'
import { formatCurrency } from '@/lib/utils'

interface Props {
  rows: LiveJobRow[]
  totals: PortfolioTotals
  lastSyncedAt: string | null
  configured: boolean
  syncing: boolean
  onSyncNow: () => void
  /** Optional — if provided, renders a "Snapshot now" button next to Refresh */
  onSnapshotNow?: () => void
  snapshotting?: boolean
}

const STATUS_STYLES = {
  on_target: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'On target' },
  watch: { dot: 'bg-amber-400', text: 'text-amber-600', label: 'Watch' },
  below_target: { dot: 'bg-red-500', text: 'text-red-600', label: 'Below target' },
} as const

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Live Jobs portfolio table — matches the Live_Jobs_Tracker__Andrew_.xlsx Summary sheet
 * column-for-column. One row per active (not-complete) project. Cost figures come from
 * the Xero feed; revenue/invoicing from local estimates + progress claims.
 */
export function LiveJobsTable({ rows, totals, lastSyncedAt, configured, syncing, onSyncNow, onSnapshotNow, snapshotting }: Props) {
  if (!configured) {
    return (
      <div className="bg-fg-bg border border-fg-border p-6">
        <p className="text-xs font-light tracking-architectural uppercase text-fg-muted mb-2">Live Jobs</p>
        <p className="text-sm font-light text-amber-600">
          Xero live job data requires the server-side setup: <code>SUPABASE_SERVICE_ROLE_KEY</code> env var,
          schema migration 03 applied, and Xero connected on the Settings page.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-fg-bg border border-fg-border">
      {/* Header strip */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-fg-border">
        <div>
          <p className="text-xs font-light tracking-architectural uppercase text-fg-muted">Live Jobs</p>
          <p className="text-2xs text-fg-muted mt-0.5">
            {totals.jobCount} active · {formatCurrency(totals.forecastRevenue)} forecast revenue · {totals.forecastGpPct.toFixed(1)}% GP
            {totals.belowTargetCount > 0 && (
              <span className="text-red-600 ml-1">· {totals.belowTargetCount} below target</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            {onSnapshotNow && (
              <button
                onClick={onSnapshotNow}
                disabled={snapshotting}
                title="Freeze the current Live Jobs view into the snapshot history (for board packs / fade tracking)"
                className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors disabled:opacity-50"
              >
                {snapshotting ? 'Saving…' : 'Snapshot now'}
              </button>
            )}
            <button
              onClick={onSyncNow}
              disabled={syncing}
              className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Refresh now'}
            </button>
          </div>
          <p className="text-2xs text-fg-muted mt-1">Last sync: {relativeTime(lastSyncedAt)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-light">
          <thead>
            <tr className="border-b border-fg-border text-2xs uppercase tracking-wide text-fg-muted">
              <th className="text-left py-2 px-4 font-light">Job</th>
              <th className="text-right py-2 px-4 font-light">Forecast revenue</th>
              <th className="text-right py-2 px-4 font-light">Invoiced</th>
              <th className="text-right py-2 px-4 font-light">% billed</th>
              <th className="text-right py-2 px-4 font-light">Cost to date</th>
              <th className="text-right py-2 px-4 font-light">Forecast cost</th>
              <th className="text-right py-2 px-4 font-light">GP $</th>
              <th className="text-right py-2 px-4 font-light">GP %</th>
              <th className="text-right py-2 px-4 font-light">Target</th>
              <th className="text-right py-2 px-4 font-light">Fade</th>
              <th className="text-left py-2 px-4 font-light">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fg-border/50">
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="text-center py-8 text-fg-muted">
                  No active projects.
                </td>
              </tr>
            )}
            {rows.map(r => {
              const style = STATUS_STYLES[r.status]
              const fadeColor = r.fadePpts < 0 ? 'text-red-500' : 'text-emerald-600'
              return (
                <tr key={r.projectId} className="hover:bg-fg-card/20 transition-colors">
                  <td className="py-3 px-4">
                    <Link
                      href={`/projects/${r.projectId}?tab=costs`}
                      className="text-fg-heading hover:underline"
                    >
                      {r.projectName}
                    </Link>
                    {!r.hasLiveCostData && (
                      <span className="ml-2 text-2xs text-amber-600">⚠ unmapped</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-fg-heading tabular-nums">{formatCurrency(r.forecastRevenue)}</td>
                  <td className="py-3 px-4 text-right text-fg-muted tabular-nums">{formatCurrency(r.invoicedToDate)}</td>
                  <td className="py-3 px-4 text-right text-fg-muted tabular-nums">{r.pctBilled.toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right text-fg-muted tabular-nums">{formatCurrency(r.costToDate)}</td>
                  <td className="py-3 px-4 text-right text-fg-muted tabular-nums">{formatCurrency(r.forecastFinalCost)}</td>
                  <td className="py-3 px-4 text-right text-fg-heading tabular-nums">{formatCurrency(r.forecastGpDollars)}</td>
                  <td className={`py-3 px-4 text-right tabular-nums ${style.text}`}>{r.forecastGpPct.toFixed(1)}%</td>
                  <td className="py-3 px-4 text-right text-fg-muted tabular-nums">{r.targetMarginPct.toFixed(0)}%</td>
                  <td className={`py-3 px-4 text-right tabular-nums ${fadeColor}`}>
                    {r.fadePpts >= 0 ? '+' : ''}{r.fadePpts.toFixed(1)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span className={`text-2xs ${style.text}`}>{style.label}</span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer disclaimer */}
      <div className="px-6 py-3 border-t border-fg-border bg-fg-card/20">
        <p className="text-2xs text-fg-muted">
          Cost from Xero · GP-only view, operating expenses excluded by design · Status anchored to each
          project&apos;s own target margin
        </p>
      </div>
    </div>
  )
}
