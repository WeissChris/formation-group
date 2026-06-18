'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { loadProjects, loadEstimatesByProject, loadProgressClaims, saveProject } from '@/lib/storage'
import { getProjects } from '@/lib/storageAsync'
import { getProjectCosts, getProjectCostPeriods, type ProjectCostRow } from '@/lib/xero'
import { computeLiveJobRow, type LiveJobRow } from '@/lib/liveJobs'
import { getMarginSummary, getEstimateTotals, activeLineItems, costBreakdown, variationContractValue } from '@/lib/estimateCalculations'
import { CostCurve } from '@/components/CostCurve'
import { formatCurrency } from '@/lib/utils'
import type { Project, Estimate, CategoryMargin } from '@/types'

export default function ProjectReportPage() {
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [row, setRow] = useState<LiveJobRow | null>(null)
  const [margins, setMargins] = useState<CategoryMargin[]>([])
  const [costs, setCosts] = useState<ProjectCostRow[]>([])
  const [variations, setVariations] = useState<Estimate[]>([])
  const [costMapped, setCostMapped] = useState(false)
  const [generatedAt, setGeneratedAt] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [baseEstimate, setBaseEstimate] = useState<Estimate | null>(null)
  const [labourActual, setLabourActual] = useState(0)

  useEffect(() => {
    ;(async () => {
      let p = loadProjects().find(x => x.id === id) ?? null
      if (!p) {
        // Local copy may have been cleared — fall back to Supabase and restore it locally
        p = (await getProjects()).find(x => x.id === id) ?? null
        if (p) saveProject(p)
      }
      setProject(p)
      const accepted = loadEstimatesByProject(id).filter(e => e.status === 'accepted')
      const base = accepted.find(e => !e.parentEstimateId)
      setMargins(base ? getMarginSummary(base) : [])
      setBaseEstimate(base ?? null)
      setVariations(accepted.filter(e => e.parentEstimateId))
      const claims = loadProgressClaims(id)
      const cr = await getProjectCosts(id)
      setCosts(cr.costs)
      setCostMapped(cr.mapped)
      try {
        const cp = await getProjectCostPeriods(id)
        setLabourActual(cp.periods.filter(p => p.source === 'labour').reduce((s, p) => s + p.amount_ex_gst, 0))
      } catch { /* no time-phased cost periods yet */ }
      const forecastFinalCost = cr.costs.reduce((s, c) => s + (c.forecast_final ?? c.amount_ex_gst), 0)
      if (p) {
        setRow(computeLiveJobRow({
          project: p,
          acceptedEstimates: accepted,
          progressClaims: claims,
          costToDate: cr.mapped ? cr.cost_to_date : null,
          forecastFinalCost: cr.mapped ? forecastFinalCost : null,
        }))
      }
      setGeneratedAt(new Date().toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))
      setLoaded(true)
    })()
  }, [id])

  if (loaded && !project) {
    return <div className="max-w-[900px] mx-auto px-6 py-10"><p className="text-sm font-light text-fg-muted">Project not found. <Link href="/reports" className="underline">Back to reports</Link></p></div>
  }
  if (!project || !row) {
    return <div className="max-w-[900px] mx-auto px-6 py-10"><p className="text-sm font-light text-fg-muted">Loading…</p></div>
  }

  const baseline = project.baseline
  // Per-variation revenue / cost / GP so variations are tracked like the estimate's own line items.
  const variationRows = variations.map(v => {
    const t = getEstimateTotals(v)
    const revenue = variationContractValue(v)
    return {
      id: v.id,
      name: v.name || `Variation ${v.variationNumber ?? ''}`,
      revenue,
      cost: t.totalCost,
      gpPct: revenue !== 0 ? ((revenue - t.totalCost) / revenue) * 100 : 0,
    }
  })
  const variationsTotal = variationRows.reduce((s, r) => s + r.revenue, 0)
  const variationsCost = variationRows.reduce((s, r) => s + r.cost, 0)
  const baseRevenue = margins.reduce((s, m) => s + m.totalRevenue, 0)
  const baseCostSum = margins.reduce((s, m) => s + m.totalCost, 0)
  const origContract = baseline?.contractValue ?? (row.forecastRevenue - variationsTotal)
  // Budget cost folds in accepted variation costs so the quoted margin tracks the revised contract.
  const baseCost = baseline?.costEstimate ?? (margins.length > 0 ? baseCostSum : null)
  const budgetCost = baseCost != null ? baseCost + variationsCost : (variations.length > 0 ? variationsCost : null)
  const revisedContract = row.forecastRevenue
  const quotedGpPct = budgetCost != null && revisedContract > 0
    ? ((revisedContract - budgetCost) / revisedContract) * 100
    : (baseline ? baseline.gpPercent : row.quotedMarginPct)
  const fadeColor = row.fadePpts >= 0 ? 'text-green-600' : 'text-red-500'

  // ── Insights: cost composition + labour, from the base estimate + accepted variations ──
  const allItems = baseEstimate ? [...activeLineItems(baseEstimate), ...variations.flatMap(v => activeLineItems(v))] : []
  const breakdown = costBreakdown(allItems)
  const labourHours = allItems.filter(i => i.type === 'Labour' && /hour|hr/i.test(i.uom || '')).reduce((s, i) => s + (i.units || 0), 0)
  const labourRate = labourHours > 0 ? breakdown.labour / labourHours : 0
  const hoursUsedEst = labourRate > 0 ? labourActual / labourRate : 0
  const COST_TYPES = [
    { key: 'labour' as const, label: 'Labour', colour: '#7C9A92' },
    { key: 'material' as const, label: 'Materials', colour: '#B08D57' },
    { key: 'subcontractor' as const, label: 'Subcontractors', colour: '#9A7C9A' },
    { key: 'equipment' as const, label: 'Equipment', colour: '#9E9890' },
  ]
  const pctOf = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
  const target = row.targetMarginPct
  const belowCats = margins.filter(m => !m.meetsTarget).map(m => m.category)

  // Plain-English commentary for the foreman — adapts to whether actual cost has started flowing.
  const commentary: { tone: 'good' | 'warn' | 'neutral'; text: string }[] = []
  if (budgetCost != null) {
    commentary.push({
      tone: quotedGpPct >= target ? 'good' : 'warn',
      text: `Quoted gross profit is ${formatCurrency(revisedContract - budgetCost)} (${quotedGpPct.toFixed(1)}%), ${quotedGpPct >= target ? 'above' : 'below'} the ${target.toFixed(0)}% target.`,
    })
  }
  if (breakdown.total > 0) {
    const biggest = [...COST_TYPES].filter(t => breakdown[t.key] > 0).sort((a, b) => breakdown[b.key] - breakdown[a.key])[0]
    if (biggest) {
      commentary.push({
        tone: 'neutral',
        text: `${biggest.label} is the biggest cost at ${formatCurrency(breakdown[biggest.key])} (${pctOf(breakdown[biggest.key], breakdown.total).toFixed(0)}% of cost)${biggest.key === 'labour' && labourHours > 0 ? `, about ${Math.round(labourHours).toLocaleString()} hours at ${formatCurrency(labourRate)}/hr` : ''}.`,
      })
    }
  }
  commentary.push({ tone: 'neutral', text: `Invoiced ${formatCurrency(row.invoicedToDate)} of ${formatCurrency(revisedContract)} so far (${row.pctBilled.toFixed(0)}%).` })
  if (costMapped) {
    const over = row.forecastFinalCost > (budgetCost ?? 0)
    commentary.push({
      tone: over ? 'warn' : 'good',
      text: `Actual cost to date ${formatCurrency(row.costToDate)}; forecast final ${formatCurrency(row.forecastFinalCost)} vs a ${formatCurrency(budgetCost ?? 0)} budget (${over ? 'over' : 'under'} by ${formatCurrency(Math.abs(row.forecastFinalCost - (budgetCost ?? 0)))}).`,
    })
  } else {
    commentary.push({ tone: 'neutral', text: `No actual cost booked yet — the figures below are the plan. They start tracking against actuals once Xero is synced or the foreman logs costs on site.` })
  }
  if (belowCats.length > 0) {
    commentary.push({ tone: 'warn', text: `Watch margin on ${belowCats.join(', ')} — below the category target.` })
  }

  const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div>
      <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{label}</p>
      <p className={`text-base font-light tabular-nums ${color ?? 'text-fg-heading'}`}>{value}</p>
    </div>
  )

  return (
    <div className="max-w-[900px] mx-auto px-6 lg:px-10 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Project financial report</p>
          <h1 className="text-xl font-light text-fg-heading">{project.name}</h1>
          <p className="text-xs font-light text-fg-muted mt-1">
            {[project.clientName, project.address].filter(Boolean).join(' · ')}{project.address || project.clientName ? ' · ' : ''}Generated {generatedAt || '…'}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Link href={`/projects/${id}`} className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors">Back to project</Link>
          <button onClick={() => window.print()} className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-heading text-fg-heading hover:bg-fg-heading hover:text-white transition-colors">Print / Save PDF</button>
        </div>
      </div>

      {/* Contract & revenue */}
      <section className="mb-8">
        <p className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted mb-3 border-b border-fg-border pb-1">Contract &amp; revenue</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Stat label="Original contract" value={formatCurrency(origContract)} />
          <Stat label="Variations" value={`${variationsTotal >= 0 ? '+' : ''}${formatCurrency(variationsTotal)}`} />
          <Stat label="Revised contract" value={formatCurrency(row.forecastRevenue)} />
          <Stat label="Invoiced to date" value={`${formatCurrency(row.invoicedToDate)} (${row.pctBilled.toFixed(0)}%)`} />
        </div>
      </section>

      {/* Cost & margin */}
      <section className="mb-8">
        <p className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted mb-3 border-b border-fg-border pb-1">Cost &amp; margin</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Stat label="Budget cost" value={budgetCost != null ? formatCurrency(budgetCost) : '—'} />
          <Stat label="Cost to date" value={costMapped ? formatCurrency(row.costToDate) : '—'} />
          <Stat label="Forecast final cost" value={costMapped ? formatCurrency(row.forecastFinalCost) : '—'} />
          <Stat label="Forecast GP" value={costMapped ? `${formatCurrency(row.forecastGpDollars)}` : '—'} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mt-5">
          <Stat label="Quoted GP %" value={`${quotedGpPct.toFixed(1)}%`} />
          <Stat label="Forecast GP %" value={costMapped ? `${row.forecastGpPct.toFixed(1)}%` : '—'} color={costMapped ? (row.forecastGpPct >= row.targetMarginPct - 2 ? 'text-green-600' : row.forecastGpPct >= row.targetMarginPct - 10 ? 'text-amber-500' : 'text-red-500') : undefined} />
          <Stat label="Fade vs quote" value={costMapped ? `${row.fadePpts >= 0 ? '+' : ''}${row.fadePpts.toFixed(1)} pts` : '—'} color={costMapped ? fadeColor : undefined} />
          <Stat label="Status" value={costMapped ? (row.status === 'on_target' ? 'On target' : row.status === 'watch' ? 'Watch' : 'Below target') : 'No cost data'} />
        </div>
      </section>

      {/* Insights & commentary — foreman-facing */}
      <section className="mb-8">
        <p className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted mb-3 border-b border-fg-border pb-1">Insights</p>

        {commentary.length > 0 && (
          <ul className="space-y-1.5 mb-6">
            {commentary.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs font-light text-fg-heading">
                <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.tone === 'good' ? '#3D5A3A' : c.tone === 'warn' ? '#C0563B' : '#9E9890' }} />
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}

        {breakdown.total > 0 && (
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Cost composition */}
            <div>
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Where the money goes</p>
              <div className="flex h-3 w-full overflow-hidden rounded-sm mb-3">
                {COST_TYPES.filter(t => breakdown[t.key] > 0).map(t => (
                  <div key={t.key} style={{ width: `${pctOf(breakdown[t.key], breakdown.total)}%`, background: t.colour }} title={`${t.label} ${formatCurrency(breakdown[t.key])}`} />
                ))}
              </div>
              <div className="space-y-1">
                {COST_TYPES.filter(t => breakdown[t.key] > 0).map(t => (
                  <div key={t.key} className="flex items-center justify-between text-xs font-light">
                    <span className="flex items-center gap-2 text-fg-heading">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: t.colour }} />
                      {t.label}
                    </span>
                    <span className="tabular-nums text-fg-muted">{formatCurrency(breakdown[t.key])} · {pctOf(breakdown[t.key], breakdown.total).toFixed(0)}%</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs border-t border-fg-border/40 pt-1 mt-1">
                  <span className="text-fg-heading">Total cost</span>
                  <span className="tabular-nums text-fg-heading">{formatCurrency(breakdown.total)}</span>
                </div>
              </div>
            </div>

            {/* Labour */}
            <div>
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Labour</p>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                <div><p className="text-2xs text-fg-muted mb-0.5">Budgeted hours</p><p className="text-sm font-light tabular-nums text-fg-heading">{labourHours > 0 ? Math.round(labourHours).toLocaleString() : '—'}</p></div>
                <div><p className="text-2xs text-fg-muted mb-0.5">Rate</p><p className="text-sm font-light tabular-nums text-fg-heading">{labourRate > 0 ? `${formatCurrency(labourRate)}/hr` : '—'}</p></div>
                <div><p className="text-2xs text-fg-muted mb-0.5">Budgeted labour cost</p><p className="text-sm font-light tabular-nums text-fg-heading">{formatCurrency(breakdown.labour)}</p></div>
                <div><p className="text-2xs text-fg-muted mb-0.5">Share of cost</p><p className="text-sm font-light tabular-nums text-fg-heading">{pctOf(breakdown.labour, breakdown.total).toFixed(0)}%</p></div>
                <div><p className="text-2xs text-fg-muted mb-0.5">Labour spent to date</p><p className="text-sm font-light tabular-nums text-fg-heading">{labourActual > 0 ? formatCurrency(labourActual) : '—'}</p></div>
                <div><p className="text-2xs text-fg-muted mb-0.5">Hours used{labourActual > 0 ? ' (est.)' : ''}</p><p className="text-sm font-light tabular-nums text-fg-heading">{hoursUsedEst > 0 ? Math.round(hoursUsedEst).toLocaleString() : '—'}</p></div>
              </div>
              {labourActual > 0 ? (
                <p className="text-2xs font-light text-fg-muted mt-3">{pctOf(labourActual, breakdown.labour).toFixed(0)}% of the labour budget spent. Hours used are estimated from cost ÷ rate.</p>
              ) : (
                <p className="text-2xs font-light text-fg-muted/70 mt-3">No labour booked yet. Actual hours need a foreman timesheet — ask me to wire it up.</p>
              )}
            </div>
          </div>
        )}

        {/* Cost — budget vs actual S-curve (lights up once Xero is synced) */}
        <CostCurve projectId={id} />
      </section>

      {/* Quoted plan by category */}
      {margins.length > 0 && (
        <section className="mb-8">
          <p className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted mb-3 border-b border-fg-border pb-1">Quoted plan by category</p>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-2xs font-light tracking-architectural uppercase text-fg-muted border-b border-fg-border/50">
                <th className="py-1.5 pr-3">Category</th>
                <th className="py-1.5 px-2 text-right">Revenue</th>
                <th className="py-1.5 px-2 text-right">Cost</th>
                <th className="py-1.5 pl-2 text-right">GP %</th>
              </tr>
            </thead>
            <tbody>
              {margins.map(m => (
                <tr key={m.category} className="border-b border-fg-border/20">
                  <td className="py-1.5 pr-3 text-xs font-light text-fg-heading">{m.category}</td>
                  <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(m.totalRevenue)}</td>
                  <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(m.totalCost)}</td>
                  <td className={`py-1.5 pl-2 text-right text-xs tabular-nums ${m.meetsTarget ? 'text-green-600' : 'text-amber-500'}`}>{(m.marginPercent * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-fg-border">
                <td className="py-1.5 pr-3 text-2xs font-light tracking-architectural uppercase text-fg-muted">Base subtotal</td>
                <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(baseRevenue)}</td>
                <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(baseCostSum)}</td>
                <td className="py-1.5 pl-2 text-right text-xs tabular-nums text-fg-muted">{baseRevenue > 0 ? (((baseRevenue - baseCostSum) / baseRevenue) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {/* Actual cost by Xero account */}
      {costMapped && costs.length > 0 && (
        <section className="mb-8">
          <p className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted mb-3 border-b border-fg-border pb-1">Actual cost by account (Xero)</p>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-2xs font-light tracking-architectural uppercase text-fg-muted border-b border-fg-border/50">
                <th className="py-1.5 pr-3">Account</th>
                <th className="py-1.5 px-2 text-right">Spent to date</th>
                <th className="py-1.5 pl-2 text-right">Forecast final</th>
              </tr>
            </thead>
            <tbody>
              {costs.map(c => (
                <tr key={c.account_code} className="border-b border-fg-border/20">
                  <td className="py-1.5 pr-3 text-xs font-light text-fg-heading">{c.account_name}</td>
                  <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(c.amount_ex_gst)}</td>
                  <td className="py-1.5 pl-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(c.forecast_final ?? c.amount_ex_gst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Variations — tracked with revenue / cost / GP like the estimate categories */}
      {variationRows.length > 0 && (
        <section className="mb-8">
          <p className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted mb-3 border-b border-fg-border pb-1">Variations</p>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-2xs font-light tracking-architectural uppercase text-fg-muted border-b border-fg-border/50">
                <th className="py-1.5 pr-3">Variation</th>
                <th className="py-1.5 px-2 text-right">Revenue</th>
                <th className="py-1.5 px-2 text-right">Cost</th>
                <th className="py-1.5 pl-2 text-right">GP %</th>
              </tr>
            </thead>
            <tbody>
              {variationRows.map(r => (
                <tr key={r.id} className="border-b border-fg-border/20">
                  <td className="py-1.5 pr-3 text-xs font-light text-fg-heading">{r.name}</td>
                  <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(r.revenue)}</td>
                  <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(r.cost)}</td>
                  <td className="py-1.5 pl-2 text-right text-xs tabular-nums text-fg-muted">{r.gpPct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-fg-border">
                <td className="py-1.5 pr-3 text-2xs font-light tracking-architectural uppercase text-fg-muted">Revised total</td>
                <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(revisedContract)}</td>
                <td className="py-1.5 px-2 text-right text-xs tabular-nums text-fg-heading">{budgetCost != null ? formatCurrency(budgetCost) : '—'}</td>
                <td className="py-1.5 pl-2 text-right text-xs tabular-nums text-fg-muted">{quotedGpPct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}
    </div>
  )
}
