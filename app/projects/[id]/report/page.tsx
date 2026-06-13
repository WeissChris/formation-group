'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { loadProjects, loadEstimatesByProject, loadProgressClaims, saveProject } from '@/lib/storage'
import { getProjects } from '@/lib/storageAsync'
import { getProjectCosts, type ProjectCostRow } from '@/lib/xero'
import { computeLiveJobRow, type LiveJobRow } from '@/lib/liveJobs'
import { getMarginSummary, getEstimateTotals } from '@/lib/estimateCalculations'
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
      setVariations(accepted.filter(e => e.parentEstimateId))
      const claims = loadProgressClaims(id)
      const cr = await getProjectCosts(id)
      setCosts(cr.costs)
      setCostMapped(cr.mapped)
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
    const revenue = v.variationAmount || t.totalRevenue
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
