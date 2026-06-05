'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import {
  getProjectCosts,
  setProjectCostForecast,
  triggerXeroSync,
  type ProjectCostRow,
  type ProjectCostsResponse,
} from '@/lib/xero'
import { reconcileLabour, computeLabourPace, isLabourAccount } from '@/lib/labour'
import type { EstimateLineItem, WeeklyActual } from '@/types'

interface Props {
  projectId: string
  projectName: string
  /** Forecast revenue (effective contract) from the parent page so we can show GP at the bottom */
  forecastRevenue: number
  /** Original baseline GP% (from estimate) so the user sees fade at a glance */
  quotedMarginPct?: number
  /** Target margin from the project itself */
  targetMarginPct: number
  /** Accepted estimate line items (all estimates flattened) — for labour allowance + pace */
  estimateLineItems?: EstimateLineItem[]
  /** Foreman-logged WeeklyActuals — for labour reconciliation against Xero */
  foremanActuals?: WeeklyActual[]
  /** Project start date — for the burn-rate calc on the pace panel */
  projectStartDate?: string
}

/**
 * Per-project Costs tab — the Beach Rd / Serpells tab equivalent from
 * `Live_Jobs_Tracker__Andrew_.xlsx`. One row per Xero account, editable forecast override
 * and free-text comment per row. Cost-of-sales total + GP line at the bottom.
 *
 * GP-only — the underlying API filters out operating expenses (DIRECTCOSTS account class
 * only). What renders here is what feeds the dashboard's Live Jobs row for this project.
 */
export function ProjectCostsTab({
  projectId,
  projectName,
  forecastRevenue,
  quotedMarginPct,
  targetMarginPct,
  estimateLineItems = [],
  foremanActuals = [],
  projectStartDate,
}: Props) {
  const [data, setData] = useState<ProjectCostsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const fresh = await getProjectCosts(projectId)
      setData(fresh)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const result = await triggerXeroSync()
      await refresh()
      if (!result.ok && result.error) window.alert(`Sync failed: ${result.error}`)
    } finally {
      setSyncing(false)
    }
  }

  if (loading || !data) {
    return <div className="text-sm font-light text-fg-muted py-8">Loading Xero cost data…</div>
  }

  if (!data.mapped) {
    return (
      <div className="bg-fg-bg border border-fg-border p-6">
        <p className="text-xs font-light tracking-architectural uppercase text-fg-muted mb-2">Live Costs</p>
        <p className="text-sm font-light text-amber-600 mb-4">
          This project isn&apos;t mapped to a Xero tracking option yet. Set the mapping in{' '}
          <a href="/settings" className="underline">Settings</a> before costs will appear here.
        </p>
      </div>
    )
  }

  // Derived totals — sum the actual + forecast (override → fall back to actual)
  const totalSpent = data.costs.reduce((s, r) => s + r.amount_ex_gst, 0)
  const totalForecast = data.costs.reduce(
    (s, r) => s + (r.forecast_final != null ? r.forecast_final : r.amount_ex_gst),
    0,
  )

  const gpDollars = forecastRevenue - totalForecast
  const gpPct = forecastRevenue > 0 ? (gpDollars / forecastRevenue) * 100 : 0
  const fadePpts = quotedMarginPct != null ? gpPct - quotedMarginPct : null

  return (
    <div className="space-y-6">
      {/* Header with last-sync + refresh */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-1">Live Costs (Xero)</h3>
          <p className="text-2xs text-fg-muted">
            GP-only · Direct job costs + production labour ·{' '}
            {data.last_pulled_at
              ? `Last sync ${new Date(data.last_pulled_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}`
              : 'No sync data yet'}
          </p>
        </div>
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Refresh'}
        </button>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-4 gap-3">
        <HeadlineTile label="Forecast revenue" value={formatCurrency(forecastRevenue)} />
        <HeadlineTile label="Cost to date" value={formatCurrency(totalSpent)} />
        <HeadlineTile label="Forecast cost" value={formatCurrency(totalForecast)} />
        <HeadlineTile
          label="Forecast GP %"
          value={`${gpPct.toFixed(1)}%`}
          subtle={
            fadePpts != null
              ? `${fadePpts >= 0 ? '+' : ''}${fadePpts.toFixed(1)} vs ${quotedMarginPct?.toFixed(0)}% quote`
              : `${targetMarginPct.toFixed(0)}% target`
          }
          tone={gpPct >= targetMarginPct - 2 ? 'good' : gpPct >= targetMarginPct - 10 ? 'warn' : 'bad'}
        />
      </div>

      {/* Labour reconciliation + pace */}
      {(() => {
        const reconciliation = reconcileLabour(data.costs, foremanActuals)
        const pace = computeLabourPace(
          estimateLineItems,
          reconciliation.xeroLabour > 0 ? reconciliation.xeroLabour : null,
          reconciliation.foremanLabour,
          projectStartDate,
        )
        // Only show if there's anything to show — no estimate labour AND no foreman AND no Xero
        const hasAnyLabour = pace.allowance > 0 || reconciliation.xeroLabour > 0 || reconciliation.foremanLabour > 0
        if (!hasAnyLabour) return null

        const driftAbsPct = Math.abs(reconciliation.driftPct)
        const driftTone = driftAbsPct > 5 ? 'text-amber-600' : 'text-emerald-600'

        return (
          <div>
            <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">Labour</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Reconciliation panel */}
              <div className="bg-fg-bg border border-fg-border p-4">
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-3">Reconciliation</p>
                <div className="space-y-1.5 text-sm font-light">
                  <div className="flex justify-between">
                    <span className="text-fg-muted">Xero (truth)</span>
                    <span className="text-fg-heading tabular-nums">{formatCurrency(reconciliation.xeroLabour)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted">Foreman entries</span>
                    <span className="text-fg-heading tabular-nums">{formatCurrency(reconciliation.foremanLabour)}</span>
                  </div>
                  <div className="flex justify-between border-t border-fg-border pt-1.5">
                    <span className="text-fg-muted">Drift</span>
                    <span className={`tabular-nums ${driftTone}`}>
                      {reconciliation.drift >= 0 ? '+' : ''}{formatCurrency(reconciliation.drift)}
                      {reconciliation.foremanLabour > 0 && ` · ${reconciliation.driftPct >= 0 ? '+' : ''}${reconciliation.driftPct.toFixed(1)}%`}
                    </span>
                  </div>
                </div>
                {reconciliation.payrollLag && (
                  <p className="text-2xs text-amber-600 mt-3">
                    ⚠ Payroll lag — foreman has logged recent weeks but Xero labour bills are over 14 days behind
                  </p>
                )}
                {driftAbsPct > 5 && !reconciliation.payrollLag && (
                  <p className="text-2xs text-amber-600 mt-3">
                    ⚠ Drift &gt; 5% — check foreman entries match payroll for missing/extra weeks
                  </p>
                )}
              </div>

              {/* Pace panel */}
              <div className="bg-fg-bg border border-fg-border p-4">
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-3">
                  Pace
                  {pace.spentSource !== 'none' && (
                    <span className="ml-2 text-fg-muted/60 normal-case tracking-normal">
                      (spent from {pace.spentSource})
                    </span>
                  )}
                </p>
                <div className="space-y-1.5 text-sm font-light">
                  <div className="flex justify-between">
                    <span className="text-fg-muted">Allowance</span>
                    <span className="text-fg-heading tabular-nums">{formatCurrency(pace.allowance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted">Spent to date</span>
                    <span className="text-fg-heading tabular-nums">{formatCurrency(pace.spent)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted">% of $ budget</span>
                    <span className={`tabular-nums ${pace.pctSpent != null && pace.pctSpent > 90 ? 'text-red-600' : pace.pctSpent != null && pace.pctSpent > 70 ? 'text-amber-600' : 'text-fg-heading'}`}>
                      {pace.pctSpent != null ? `${pace.pctSpent.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-fg-border pt-1.5">
                    <span className="text-fg-muted">Weekly burn rate</span>
                    <span className="text-fg-heading tabular-nums">
                      {pace.weeklyBurnRate != null ? `${formatCurrency(pace.weeklyBurnRate)}/wk` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-fg-muted">Weeks left at burn</span>
                    <span className={`tabular-nums ${pace.weeksLeftAtBurn != null && pace.weeksLeftAtBurn < 2 ? 'text-red-600' : pace.weeksLeftAtBurn != null && pace.weeksLeftAtBurn < 4 ? 'text-amber-600' : 'text-fg-heading'}`}>
                      {pace.weeksLeftAtBurn != null
                        ? `${pace.weeksLeftAtBurn.toFixed(1)} weeks`
                        : pace.spent >= pace.allowance
                          ? 'over allowance'
                          : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Per-account table */}
      <div>
        <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">Revenue & cost detail</h3>
        {data.costs.length === 0 ? (
          <p className="text-sm font-light text-fg-muted py-6">
            No costs yet. Either no bills have been tagged to this project in Xero in the last
            24 months, or the sync hasn&apos;t run since the mapping was set. Click Refresh above.
          </p>
        ) : (
          <table className="w-full text-sm font-light">
            <thead>
              <tr className="border-b border-fg-border text-2xs uppercase tracking-wide text-fg-muted">
                <th className="text-left py-2 pr-3 font-light">Account</th>
                <th className="text-right py-2 px-3 font-light">Spent to date</th>
                <th className="text-right py-2 px-3 font-light">Forecast final</th>
                <th className="text-right py-2 px-3 font-light">vs Spent</th>
                <th className="text-left py-2 pl-3 font-light">Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fg-border/50">
              {data.costs.map(row => (
                <CostRow
                  key={row.account_code}
                  row={row}
                  projectId={projectId}
                  onSaved={refresh}
                />
              ))}
              {/* Totals */}
              <tr className="border-t-2 border-fg-heading font-medium">
                <td className="py-3 pr-3 text-fg-heading uppercase text-2xs tracking-wide">Total cost of sales</td>
                <td className="py-3 px-3 text-right text-fg-heading tabular-nums">{formatCurrency(totalSpent)}</td>
                <td className="py-3 px-3 text-right text-fg-heading tabular-nums">{formatCurrency(totalForecast)}</td>
                <td className="py-3 px-3 text-right text-fg-muted tabular-nums">
                  {formatCurrency(totalForecast - totalSpent)}
                </td>
                <td />
              </tr>
              <tr>
                <td className="py-3 pr-3 text-fg-heading uppercase text-2xs tracking-wide">Gross profit</td>
                <td className="py-3 px-3 text-right text-fg-muted">—</td>
                <td className="py-3 px-3 text-right text-fg-heading tabular-nums">{formatCurrency(gpDollars)}</td>
                <td colSpan={2} />
              </tr>
              <tr>
                <td className="py-3 pr-3 text-fg-muted uppercase text-2xs tracking-wide">Gross profit %</td>
                <td className="py-3 px-3 text-right text-fg-muted">—</td>
                <td className={`py-3 px-3 text-right tabular-nums ${gpPct >= targetMarginPct - 2 ? 'text-emerald-600' : gpPct >= targetMarginPct - 10 ? 'text-amber-600' : 'text-red-600'}`}>
                  {gpPct.toFixed(1)}%
                </td>
                <td colSpan={2} className="py-3 pl-3 text-2xs text-fg-muted">
                  Target {targetMarginPct.toFixed(0)}%
                  {quotedMarginPct != null && `  ·  Original quote ${quotedMarginPct.toFixed(0)}%`}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Footer note */}
      <p className="text-2xs text-fg-muted/80">
        Only direct job costs appear here: cost-of-sales accounts (materials, subbies, plant)
        plus production wages and super, which post via payroll and are sourced from the Xero
        profit and loss report. Operating expenses, director comp and overheads — never queried,
        never displayed. If a cost is missing from a project, check the bill or pay run in Xero
        has the right Project tracking option set.
      </p>
    </div>
  )
}

function HeadlineTile({
  label,
  value,
  subtle,
  tone,
}: {
  label: string
  value: string
  subtle?: string
  tone?: 'good' | 'warn' | 'bad'
}) {
  const toneClass = tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : 'text-fg-heading'
  return (
    <div className="bg-fg-bg border border-fg-border p-4">
      <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">{label}</p>
      <p className={`text-lg font-light tabular-nums ${toneClass}`}>{value}</p>
      {subtle && <p className="text-2xs text-fg-muted mt-1">{subtle}</p>}
    </div>
  )
}

/**
 * One editable row — forecast override and comment. Saves on blur to keep network chatter
 * low and not block typing. After save, re-fetches the parent's data so totals update.
 */
function CostRow({
  row,
  projectId,
  onSaved,
}: {
  row: ProjectCostRow
  projectId: string
  onSaved: () => void
}) {
  // Local edit state — initialised from server. Synced back via parent refresh after save.
  const [forecast, setForecast] = useState(row.forecast_final == null ? '' : String(row.forecast_final))
  const [comment, setComment] = useState(row.comment ?? '')
  const [saving, setSaving] = useState(false)

  // If the server data changes (parent refreshed), sync local. Use account_code as key to
  // ensure the row re-mounts when the underlying account changes.
  useEffect(() => {
    setForecast(row.forecast_final == null ? '' : String(row.forecast_final))
    setComment(row.comment ?? '')
  }, [row.forecast_final, row.comment])

  const save = async () => {
    setSaving(true)
    try {
      const parsed = forecast.trim() === '' ? null : parseFloat(forecast.replace(/[^0-9.-]/g, ''))
      const finalValue = parsed != null && Number.isFinite(parsed) ? parsed : null
      const ok = await setProjectCostForecast(projectId, row.account_code, finalValue, comment.trim() || null)
      if (ok) onSaved()
    } finally {
      setSaving(false)
    }
  }

  // The effective forecast for the variance column
  const effectiveForecast = forecast.trim() === '' ? row.amount_ex_gst : (parseFloat(forecast.replace(/[^0-9.-]/g, '')) || row.amount_ex_gst)
  const variance = effectiveForecast - row.amount_ex_gst

  return (
    <tr className="hover:bg-fg-card/20 transition-colors">
      <td className="py-2 pr-3 text-fg-heading">
        {row.account_name}
        <span className="text-2xs text-fg-muted/70 ml-2">
          {isLabourAccount(row.account_name)
            ? 'from payroll'
            : `${row.bill_count} bill${row.bill_count === 1 ? '' : 's'}`}
        </span>
      </td>
      <td className="py-2 px-3 text-right text-fg-muted tabular-nums">{formatCurrency(row.amount_ex_gst)}</td>
      <td className="py-2 px-3 text-right">
        <input
          type="text"
          inputMode="decimal"
          value={forecast}
          onChange={e => setForecast(e.target.value)}
          onBlur={save}
          disabled={saving}
          placeholder={String(Math.round(row.amount_ex_gst))}
          className="w-32 px-2 py-1 text-right bg-transparent border border-fg-border/60 text-fg-heading text-sm font-light tabular-nums outline-none focus:border-fg-heading"
        />
      </td>
      <td className={`py-2 px-3 text-right tabular-nums text-2xs ${variance > 0 ? 'text-red-500' : variance < 0 ? 'text-emerald-600' : 'text-fg-muted'}`}>
        {variance === 0 ? '—' : formatCurrency(variance)}
      </td>
      <td className="py-2 pl-3">
        <input
          type="text"
          value={comment}
          onChange={e => setComment(e.target.value)}
          onBlur={save}
          disabled={saving}
          placeholder="—"
          className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-fg-border/60 focus:border-fg-heading text-fg-muted text-2xs outline-none"
        />
      </td>
    </tr>
  )
}
