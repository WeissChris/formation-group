'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ProjectCostsTab } from '@/components/ProjectCostsTab'
import { getTargetMarginPct } from '@/lib/projectHealth'
import Link from 'next/link'
import {
  loadProjects, loadWeeklyRevenue, loadEstimates, saveEstimate,
  loadGanttEntries, loadWeeklyActuals, loadProgressClaims,
  loadProgressPaymentStages, saveProject,
  loadSubcontractors,
} from '@/lib/storage'
import { getProjects, reconcileVariations, upsertProject, deleteProjectAsync, upsertSubcontractor, deleteSubcontractorAsync } from '@/lib/storageAsync'
import { formatCurrency, generateId } from '@/lib/utils'
import { getEstimateTotals, variationContractValue, estimateLabourHours, activeLineItems, STD_LABOUR_RATE } from '@/lib/estimateCalculations'
import type { Project, Estimate, WeeklyRevenue, GanttEntry, WeeklyActual, ProgressClaim, ProgressPaymentStage, SubcontractorPackage, SubcontractorClaim } from '@/types'
import { STAGE_LABELS, STAGE_COLOURS, STAGE_ORDER, PROGRESSION_WARNINGS, buildChecklist, defaultStageForStatus } from '@/lib/stageConfig'
import type { ProjectScope } from '@/types'
import type { ProjectStage } from '@/types'
import { calcProjectHealth, scheduleStatus, healthColour, healthBg, healthBorder, getForecastCompletion } from '@/lib/projectHealth'
import FinancialOperations from '@/components/FinancialOperations'
import EntityBadge from '@/components/EntityBadge'
import { Pencil, Trash2, ChevronRight, Plus, ExternalLink, Copy, Check, X } from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatProjectDate(dateStr: string | undefined): string {
  if (!dateStr) return 'TBC'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'TBC'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusPill({ status }: { status: Project['status'] }) {
  const map: Record<Project['status'], string> = {
    planning: 'Planning',
    active:   'Active',
    complete: 'Complete',
    invoiced: 'Invoiced',
  }
  return (
    <span className="text-2xs font-light tracking-wide uppercase text-fg-muted border border-fg-border rounded-sm px-1.5 py-0.5">
      {map[status]}
    </span>
  )
}

function EstimateStatusBadge({ status }: { status: Estimate['status'] }) {
  const map: Record<Estimate['status'], { label: string; cls: string }> = {
    draft:     { label: 'Draft',     cls: 'text-fg-muted border-fg-border' },
    sent:      { label: 'Sent',      cls: 'text-blue-400 border-blue-400/40' },
    accepted:  { label: 'Accepted',  cls: 'text-emerald-400 border-emerald-400/40' },
    variation: { label: 'Variation', cls: 'text-amber-400 border-amber-400/40' },
    declined:  { label: 'Declined',  cls: 'text-red-400 border-red-400/40' },
  }
  const cfg = map[status]
  return (
    <span className={`text-2xs font-light tracking-wide uppercase border rounded-sm px-1.5 py-0.5 ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── SubcontractorsTab (inline) ───────────────────────────────────────────────

function SubcontractorsTab({ projectId }: { projectId: string }) {
  const [packages, setPackages] = useState<SubcontractorPackage[]>(() => loadSubcontractors(projectId))
  const [editing, setEditing] = useState<SubcontractorPackage | null>(null)
  const [showForm, setShowForm] = useState(false)

  const blank = (): SubcontractorPackage => ({
    id: generateId(), projectId, name: '', trade: '',
    approvedValue: 0, variations: 0, invoicedToDate: 0,
    createdAt: new Date().toISOString(),
  })

  const refresh = () => setPackages(loadSubcontractors(projectId))

  const handleSave = (pkg: SubcontractorPackage) => {
    void upsertSubcontractor(pkg)   // localStorage (immediate) + Supabase (background)
    refresh()
    setEditing(null)
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this subcontractor package?')) return
    void deleteSubcontractorAsync(id)   // localStorage (immediate) + Supabase (background)
    refresh()
  }

  // Claimed-to-date = sum of the individual progress claims when present, else the legacy single number.
  const claimedOf = (p: SubcontractorPackage) => (p.claims && p.claims.length ? p.claims.reduce((s, c) => s + (c.amount || 0), 0) : p.invoicedToDate)
  const totalApproved = packages.reduce((s, p) => s + p.approvedValue, 0)
  const totalVariations = packages.reduce((s, p) => s + p.variations, 0)
  const totalRevised = totalApproved + totalVariations
  const totalInvoiced = packages.reduce((s, p) => s + claimedOf(p), 0)
  const totalRemaining = totalRevised - totalInvoiced

  const Form = ({ pkg, onSave, onCancel }: { pkg: SubcontractorPackage; onSave: (p: SubcontractorPackage) => void; onCancel: () => void }) => {
    const [form, setForm] = useState({ ...pkg })
    const set = (k: keyof SubcontractorPackage, v: string | number) => setForm(f => ({ ...f, [k]: v }))
    const claims = form.claims ?? []
    const claimedSum = claims.reduce((s, c) => s + (c.amount || 0), 0)
    const revisedTotal = (form.approvedValue || 0) + (form.variations || 0)
    const addClaim = () => setForm(f => ({ ...f, claims: [...(f.claims ?? []), { id: generateId(), date: new Date().toISOString().slice(0, 10), amount: 0 }] }))
    const updateClaim = (idx: number, patch: Partial<SubcontractorClaim>) => setForm(f => ({ ...f, claims: (f.claims ?? []).map((c, i) => i === idx ? { ...c, ...patch } : c) }))
    const removeClaim = (idx: number) => setForm(f => ({ ...f, claims: (f.claims ?? []).filter((_, i) => i !== idx) }))
    return (
      <div className="border border-fg-border p-5 bg-fg-card/20 mb-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Subcontractor Name</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Smith Excavations"
              className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors" />
          </div>
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Trade / Package</label>
            <input value={form.trade} onChange={e => set('trade', e.target.value)} placeholder="e.g. Excavation, Concrete, Electrical"
              className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Quoted Value ($)</label>
            <input type="number" value={form.approvedValue || ''} onChange={e => set('approvedValue', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors tabular-nums" />
          </div>
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Variations ($)</label>
            <input type="number" value={form.variations || ''} onChange={e => set('variations', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors tabular-nums" />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Quote File Upload</label>
          <input type="file" accept=".pdf,.doc,.docx,.xlsx,.jpg,.png"
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              const reader = new FileReader()
              reader.onload = ev => setForm(f => ({ ...f, quoteFileName: file.name, quoteFileData: ev.target?.result as string }))
              reader.readAsDataURL(file)
            }}
            className="text-xs font-light text-fg-muted file:mr-3 file:px-3 file:py-1.5 file:border file:border-fg-border file:bg-fg-bg file:text-xs file:font-light file:text-fg-heading file:rounded-none file:cursor-pointer hover:file:bg-fg-card" />
          {form.quoteFileName && <p className="text-2xs text-fg-muted mt-1">📎 {form.quoteFileName}</p>}
        </div>
        <div className="mb-4">
          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Notes</label>
          <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2}
            className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors resize-none" />
        </div>
        {/* Progress claims against the quote */}
        <div className="mb-4">
          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-2">Progress Claims</label>
          {claims.length === 0 && <p className="text-2xs text-fg-muted/60 mb-2">Add each progress claim the subbie makes against their quote.</p>}
          {claims.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 mb-1.5">
              <input type="date" value={(c.date || '').slice(0, 10)} onChange={e => updateClaim(i, { date: e.target.value })}
                className="px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light outline-none focus:border-fg-heading transition-colors" />
              <input type="number" value={c.amount || ''} onChange={e => updateClaim(i, { amount: parseFloat(e.target.value) || 0 })} placeholder="Amount"
                className="w-28 px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light text-right tabular-nums outline-none focus:border-fg-heading transition-colors" />
              <input value={c.reference || ''} onChange={e => updateClaim(i, { reference: e.target.value })} placeholder="Ref / invoice #"
                className="flex-1 min-w-0 px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light outline-none focus:border-fg-heading transition-colors" />
              <button onClick={() => removeClaim(i)} className="text-red-400/50 hover:text-red-400 transition-colors p-1 shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={addClaim} className="mt-1 flex items-center gap-1 text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">
            <Plus className="w-3 h-3" /> Add Claim
          </button>
        </div>
        {/* Revised total preview */}
        <div className="flex items-center gap-6 mb-4 text-xs font-light text-fg-muted">
          <span>Revised Total: <strong className="text-fg-heading">{formatCurrency(revisedTotal)}</strong></span>
          <span>Claimed: <strong className="text-fg-heading">{formatCurrency(claimedSum)}</strong></span>
          <span>Remaining: <strong className={`${(revisedTotal - claimedSum) >= 0 ? 'text-fg-heading' : 'text-red-500'}`}>
            {formatCurrency(Math.max(0, revisedTotal - claimedSum))}
          </strong></span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => onSave({ ...form, invoicedToDate: claims.length ? claimedSum : form.invoicedToDate })} className="px-5 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors">Save</button>
          <button onClick={onCancel} className="text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Summary row */}
      {packages.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Approved', value: totalApproved },
            { label: 'Variations', value: totalVariations },
            { label: 'Revised Total', value: totalRevised },
            { label: 'Remaining', value: totalRemaining },
          ].map(s => (
            <div key={s.label} className="bg-fg-bg border border-fg-border rounded-sm p-3">
              <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">{s.label}</p>
              <p className={`text-base font-light tabular-nums ${s.label === 'Remaining' && s.value < 0 ? 'text-red-500' : 'text-fg-heading'}`}>{formatCurrency(s.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      {(showForm || editing) && (
        <Form
          pkg={editing ?? blank()}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {/* Table */}
      {packages.length === 0 && !showForm ? (
        <div className="border border-fg-border py-12 text-center">
          <p className="text-sm font-light text-fg-heading mb-2">No subcontractors added yet</p>
          <p className="text-xs font-light text-fg-muted mb-4">Track approved packages, invoiced amounts and remaining spend</p>
          <button onClick={() => setShowForm(true)} className="px-5 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors">
            + Add Package
          </button>
        </div>
      ) : (
        <>
          <div className="border border-fg-border divide-y divide-fg-border">
            {/* Header */}
            <div className="grid grid-cols-7 px-4 py-2.5 bg-fg-card/20 text-2xs font-light tracking-architectural uppercase text-fg-muted">
              <span className="col-span-2">Subcontractor / Trade</span>
              <span className="text-right">Approved</span>
              <span className="text-right">Variations</span>
              <span className="text-right">Revised</span>
              <span className="text-right">Claimed</span>
              <span className="text-right">Remaining</span>
            </div>
            {packages.map(pkg => {
              const revised = pkg.approvedValue + pkg.variations
              const claimed = claimedOf(pkg)
              const remaining = revised - claimed
              const pct = revised > 0 ? Math.round((claimed / revised) * 100) : 0
              return (
                <div key={pkg.id} className="grid grid-cols-7 px-4 py-3 hover:bg-fg-card/20 transition-colors group">
                  <div className="col-span-2">
                    <p className="text-xs font-light text-fg-heading">{pkg.name || '—'}</p>
                    <p className="text-2xs text-fg-muted">{pkg.trade}</p>
                    {pkg.quoteFileName && (
                      <button
                        onClick={() => {
                          if (pkg.quoteFileData) {
                            const a = document.createElement('a'); a.href = pkg.quoteFileData; a.download = pkg.quoteFileName!; a.click()
                          }
                        }}
                        className="text-2xs text-fg-muted/60 hover:text-fg-heading transition-colors mt-0.5 block"
                      >
                        📎 {pkg.quoteFileName}
                      </button>
                    )}
                  </div>
                  <p className="text-xs font-light tabular-nums text-right text-fg-heading self-center">{formatCurrency(pkg.approvedValue)}</p>
                  <p className={`text-xs font-light tabular-nums text-right self-center ${pkg.variations > 0 ? 'text-amber-500' : 'text-fg-muted/40'}`}>
                    {pkg.variations > 0 ? `+${formatCurrency(pkg.variations)}` : '—'}
                  </p>
                  <p className="text-xs font-light tabular-nums text-right text-fg-heading self-center">{formatCurrency(revised)}</p>
                  <div className="self-center text-right">
                    <p className="text-xs font-light tabular-nums text-fg-heading">{formatCurrency(claimed)}</p>
                    <div className="h-1 bg-fg-border/40 rounded-full overflow-hidden mt-1 w-16 ml-auto">
                      <div className="h-full bg-fg-dark/50 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                  <div className="self-center text-right flex items-center justify-end gap-2">
                    <p className={`text-xs font-light tabular-nums ${remaining < 0 ? 'text-red-500' : 'text-fg-heading'}`}>
                      {formatCurrency(remaining)}
                    </p>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button onClick={() => { setEditing(pkg); setShowForm(false) }} className="text-2xs text-fg-muted hover:text-fg-heading transition-colors">Edit</button>
                      <button onClick={() => handleDelete(pkg.id)} className="text-2xs text-red-400/50 hover:text-red-400 transition-colors">Del</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {!showForm && !editing && (
            <button onClick={() => setShowForm(true)} className="mt-4 flex items-center gap-2 text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">
              <Plus className="w-3 h-3" /> Add Package
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── ProjectFinancialPosition (inline) ────────────────────────────────────────

interface PositionProps {
  project: Project
  estimates: Estimate[]
  ganttEntries: GanttEntry[]
  actuals: WeeklyActual[]
  revenueEntries: WeeklyRevenue[]
  progressClaims: ProgressClaim[]
  onAddEstimate: () => void
  onSetupGantt: () => void
}

// Auto-redirects to the Gantt page immediately on render
function GanttAutoRedirect({ projectId, ganttEntries }: { projectId: string; ganttEntries: any[] }) {
  const router = useRouter()
  useEffect(() => {
    router.push(`/projects/${projectId}/gantt`)
  }, [projectId, router])

  // Show immediately while redirect happens
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      {ganttEntries.length > 0 ? (
        <>
          <p className="text-xs font-light text-fg-muted">Loading schedule…</p>
          <p className="text-2xs text-fg-muted">{ganttEntries.length} categor{ganttEntries.length !== 1 ? 'ies' : 'y'} scheduled</p>
        </>
      ) : (
        <>
          <p className="text-sm font-light text-fg-heading mb-1">No schedule created yet</p>
          <p className="text-xs font-light text-fg-muted mb-2">Build your project timeline from estimate categories</p>
          <Link
            href={`/projects/${projectId}/gantt`}
            className="px-5 py-2.5 text-xs font-light tracking-wide uppercase bg-fg-dark text-white/80 hover:bg-fg-heading/80 transition-colors"
          >
            Create Schedule
          </Link>
        </>
      )}
    </div>
  )
}

function ProjectFinancialPosition({
  project, estimates, ganttEntries, actuals, revenueEntries, progressClaims, onAddEstimate, onSetupGantt,
}: PositionProps) {
  const contractValue = project.contractValue || 0

  // Accepted estimates
  const acceptedEstimates = estimates.filter(e => e.status === 'accepted' && !e.parentEstimateId)
  const variationEstimates = estimates.filter(e => e.parentEstimateId && e.status === 'accepted')

  // Contract uses the marked-up, rounded ex-GST value (getEstimateTotals.totalRevenue) over ACTIVE
  // lines — the same basis as the project report and the dashboard Live Jobs row. Summing bare
  // li.revenue understated the contract (and forecast GP) by the project markups + rounding.
  const originalContract = acceptedEstimates.reduce((sum, e) => sum + getEstimateTotals(e).totalRevenue, 0)
  const variationsTotal = variationEstimates.reduce((sum, e) => sum + variationContractValue(e), 0)
  const revisedContract = originalContract + variationsTotal

  // Budget cost from estimates (active lines, matching the revenue basis above)
  const budgetCost = estimates
    .filter(e => e.status === 'accepted')
    .reduce((sum, e) => sum + getEstimateTotals(e).totalCost, 0)

  // Actual cost from actuals
  const actualCost = actuals.reduce((sum, a) => sum + a.supplyCost + a.labourCost, 0)

  // Invoiced to date — prefer progress claims when the project uses that model (Operations tab writes claims),
  // fall back to WeeklyRevenue.actualInvoiced (hand-typed in the Revenue calendar) for projects with no claims.
  // sent + paid = issued to client; drafts and pending haven't gone out yet.
  const claimsInvoiced = progressClaims
    .filter(c => c.status === 'sent' || c.status === 'paid')
    .reduce((sum, c) => sum + c.subtotalEx, 0)
  // Defensive `?? 0` — legacy WeeklyRevenue rows in localStorage can lack actualInvoiced;
  // a single missing field cascades NaN through currentGP and silently disables alerts.
  const manualInvoiced = revenueEntries.reduce((sum, r) => sum + (r.actualInvoiced ?? 0), 0)
  const totalInvoiced = claimsInvoiced > 0 ? claimsInvoiced : manualInvoiced

  // Effective contract value — revised (incl. approved variations) where available, original otherwise.
  // budgetCost includes variation line items, so the forecast must use the same revenue basis or GP drifts.
  const effectiveContract = revisedContract || contractValue

  // GP calculations
  const currentGP = totalInvoiced > 0
    ? ((totalInvoiced - actualCost) / totalInvoiced) * 100
    : 0
  const forecastGP = effectiveContract > 0 && budgetCost > 0
    ? ((effectiveContract - budgetCost) / effectiveContract) * 100
    : 0

  // Forecast final cost = the FULL budget. The Gantt is a scheduling tool that's often only partly built,
  // so summing its entries undercounts the job (a Preliminaries-only Gantt read $6.8k of a $238k budget)
  // and inflated the Baseline-vs-Forecast GP% to ~98%. Prefer the accepted-estimate budget; fall back to
  // the Gantt sum only when there's no estimate to budget from.
  const ganttCost = ganttEntries.reduce((sum, g) => sum + g.budgetedCost, 0)
  const forecastCost = budgetCost > 0 ? budgetCost : ganttCost

  // Progress claims
  const totalClaimed = progressClaims.reduce((sum, c) => sum + c.subtotalEx, 0)

  // WIP — keep the unclamped ratio so over-invoicing/over-budget can show a red flag,
  // and a clamped value for the bar width (CSS can't render > 100%).
  const wipRatio = effectiveContract > 0 ? (totalInvoiced / effectiveContract) * 100 : 0
  const costRatio = budgetCost > 0 ? (actualCost / budgetCost) * 100 : 0
  const wipPercent = Math.min(100, wipRatio)
  const costPercent = Math.min(100, costRatio)
  const isOverInvoiced = wipRatio > 100
  const isOverBudget = costRatio > 100

  // Labour hours: allowed (accepted estimates incl. variations) vs used to date. Labour is always priced
  // at STD_LABOUR_RATE, so the estimate hours (labour$/rate) and actual hours (actual labour$/rate) share
  // one basis and compare cleanly.
  const allowedLabourHours = estimates
    .filter(e => e.status === 'accepted')
    .reduce((sum, e) => sum + estimateLabourHours(activeLineItems(e)), 0)
  const usedLabourCost = actuals.reduce((sum, a) => sum + a.labourCost, 0)
  const usedLabourHours = usedLabourCost / STD_LABOUR_RATE
  const remainingLabourHours = allowedLabourHours - usedLabourHours
  const allowedLabourCost = allowedLabourHours * STD_LABOUR_RATE
  const labourHoursPct = allowedLabourHours > 0 ? (usedLabourHours / allowedLabourHours) * 100 : 0
  const labourOver = labourHoursPct > 100
  const labourBarPct = Math.min(100, labourHoursPct)
  // Early warning: hours burning faster than billing (consumed % running well ahead of invoiced %).
  const labourAheadOfBilling = allowedLabourHours > 0 && totalInvoiced > 0 && labourHoursPct > wipRatio + 10
  const fmtHrs = (h: number) => `${Math.round(h).toLocaleString()} hrs`

  const hasData = estimates.length > 0 || ganttEntries.length > 0

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <p className="text-fg-muted font-light text-sm">No financial data yet.</p>
        <div className="flex gap-3">
          <button
            onClick={onAddEstimate}
            className="px-4 py-2 text-xs font-light tracking-wide uppercase bg-fg-dark text-white/80 rounded-sm hover:bg-fg-heading/80 transition-colors"
          >
            Add Estimate
          </button>
          <button
            onClick={onSetupGantt}
            className="px-4 py-2 text-xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-fg-heading transition-colors"
          >
            Set Up Gantt
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* Baseline vs Forecast */}
      {project.baseline && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted">Baseline vs Forecast</h3>
            <span className="text-2xs text-fg-muted">
              Baseline locked {new Date(project.baseline.capturedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>

          {/* Programme */}
          {(project.baseline.plannedStart || project.baseline.plannedCompletion) && (() => {
            const baselineDate = project.baseline.plannedCompletion
            const forecastDate = getForecastCompletion(project, ganttEntries)
            const today = new Date()
            const baselineMs = baselineDate ? new Date(baselineDate).getTime() : null
            const forecastMs = forecastDate ? new Date(forecastDate).getTime() : null
            // Traffic light: compare forecast vs baseline
            const daysDiff = baselineMs && forecastMs ? Math.round((forecastMs - baselineMs) / (1000 * 60 * 60 * 24)) : null
            const trafficLight = daysDiff === null ? null
              : daysDiff <= 0 ? 'green'
              : daysDiff <= 7 ? 'amber'
              : 'red'
            const trafficDot = trafficLight === 'green' ? 'bg-green-500'
              : trafficLight === 'amber' ? 'bg-amber-400'
              : trafficLight === 'red' ? 'bg-red-500'
              : 'bg-fg-border'
            const trafficText = trafficLight === 'green' ? 'On schedule'
              : trafficLight === 'amber' ? `${daysDiff}d behind`
              : trafficLight === 'red' ? `${daysDiff}d delayed`
              : ''
            return (
              <div className="border border-fg-border mb-4">
                <div className="px-4 py-2.5 bg-fg-card/20 border-b border-fg-border flex items-center justify-between">
                  <p className="text-2xs font-medium tracking-architectural uppercase text-fg-muted">Programme</p>
                  {trafficLight && (
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full inline-block ${trafficDot}`} />
                      <span className={`text-2xs font-medium ${
                        trafficLight === 'green' ? 'text-green-600' :
                        trafficLight === 'amber' ? 'text-amber-500' : 'text-red-500'
                      }`}>{trafficText}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 divide-x divide-fg-border">
                  <div className="px-4 py-4">
                    <p className="text-2xs text-fg-muted uppercase tracking-wide mb-1">Baseline Completion</p>
                    <p className="text-sm font-light text-fg-heading">
                      {baselineDate
                        ? new Date(baselineDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>
                  <div className="px-4 py-4">
                    <p className="text-2xs text-fg-muted uppercase tracking-wide mb-1">Forecast Completion</p>
                    <div className="flex items-center gap-2">
                      {trafficLight && <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${trafficDot}`} />}
                      <p className={`text-sm font-light ${
                        trafficLight === 'red' ? 'text-red-500' :
                        trafficLight === 'amber' ? 'text-amber-500' :
                        'text-fg-heading'
                      }`}>
                        {forecastDate
                          ? new Date(forecastDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Financial comparison table */}
          <div className="border border-fg-border">
            <div className="grid grid-cols-4 px-4 py-2.5 bg-fg-card/20 border-b border-fg-border">
              <span className="text-2xs font-medium tracking-architectural uppercase text-fg-muted col-span-1">Financial (Ex GST)</span>
              <span className="text-2xs text-fg-muted uppercase tracking-wide text-right">Baseline</span>
              <span className="text-2xs text-fg-muted uppercase tracking-wide text-right">Forecast</span>
              <span className="text-2xs text-fg-muted uppercase tracking-wide text-right">Variance</span>
            </div>
            {[
              {
                label: 'Revenue',
                baseline: project.baseline.contractValue,
                forecast: revisedContract || contractValue,
              },
              {
                label: 'Cost',
                baseline: project.baseline.costEstimate,
                forecast: forecastCost || budgetCost,
              },
              {
                label: 'Gross Profit',
                baseline: project.baseline.grossProfit,
                forecast: (revisedContract || contractValue) - (forecastCost || budgetCost),
              },
            ].map(row => {
              const variance = row.forecast - row.baseline
              const isPositive = row.label === 'Cost' ? variance <= 0 : variance >= 0
              return (
                <div key={row.label} className="grid grid-cols-4 px-4 py-3 border-b border-fg-border/30 last:border-0">
                  <span className="text-xs font-light text-fg-heading">{row.label}</span>
                  <span className="text-xs font-light text-fg-muted tabular-nums text-right">{formatCurrency(row.baseline)}</span>
                  <span className="text-xs font-light text-fg-heading tabular-nums text-right">{formatCurrency(row.forecast)}</span>
                  <span className={`text-xs font-light tabular-nums text-right ${variance === 0 ? 'text-fg-muted' : isPositive ? 'text-green-600' : 'text-red-500'}`}>
                    {variance >= 0 ? '+' : ''}{formatCurrency(variance)}
                  </span>
                </div>
              )
            })}
            {/* GP% row */}
            {(() => {
              const baselineGP = project.baseline.gpPercent
              const fcRevenue = revisedContract || contractValue
              const fcCost = forecastCost || budgetCost
              const forecastGPVal = fcRevenue > 0 && fcCost > 0 ? ((fcRevenue - fcCost) / fcRevenue) * 100 : 0
              const gpVariance = forecastGPVal - baselineGP
              return (
                <div className="grid grid-cols-4 px-4 py-3 border-t border-fg-border bg-fg-card/10">
                  <span className="text-xs font-medium text-fg-heading">GP%</span>
                  <span className="text-xs font-light text-fg-muted tabular-nums text-right">{baselineGP.toFixed(1)}%</span>
                  <span className={`text-xs font-light tabular-nums text-right ${forecastGPVal >= 40 ? 'text-green-600' : forecastGPVal >= 35 ? 'text-amber-500' : 'text-red-500'}`}>
                    {forecastGPVal.toFixed(1)}%
                  </span>
                  <span className={`text-xs font-light tabular-nums text-right ${gpVariance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {gpVariance >= 0 ? '+' : ''}{gpVariance.toFixed(1)}%
                  </span>
                </div>
              )
            })()}
          </div>

          {/* Category breakdown (if available) */}
          {project.baseline.categories && project.baseline.categories.length > 0 && (
            <details className="mt-3">
              <summary className="text-2xs text-fg-muted cursor-pointer hover:text-fg-heading transition-colors py-1">
                Category breakdown ({project.baseline.categories.length} categories)
              </summary>
              <div className="mt-2 border border-fg-border/50">
                <div className="grid grid-cols-4 px-4 py-2 bg-fg-card/10 border-b border-fg-border/30">
                  <span className="text-2xs text-fg-muted col-span-2">Category</span>
                  <span className="text-2xs text-fg-muted text-right">Revenue</span>
                  <span className="text-2xs text-fg-muted text-right">Cost</span>
                </div>
                {project.baseline.categories.map(cat => (
                  <div key={cat.name} className="grid grid-cols-4 px-4 py-2.5 border-b border-fg-border/20 last:border-0">
                    <span className="text-xs font-light text-fg-heading col-span-2 truncate">{cat.name}</span>
                    <span className="text-xs font-light text-fg-heading tabular-nums text-right">{formatCurrency(cat.revenue)}</span>
                    <span className="text-xs font-light text-fg-muted tabular-nums text-right">{formatCurrency(cat.cost)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Contract Summary */}
      <div>
        <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">Contract Summary <span className="normal-case font-light text-fg-muted/60">(Ex GST)</span></h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
            <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Original Contract</p>
            <p className="text-lg font-light text-fg-heading">{formatCurrency(originalContract || contractValue)}</p>
          </div>
          <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
            <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Variations</p>
            <p className="text-lg font-light text-fg-heading">{formatCurrency(variationsTotal)}</p>
          </div>
          <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
            <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Revised Contract</p>
            <p className="text-lg font-light text-fg-heading">{formatCurrency(revisedContract || contractValue)}</p>
          </div>
        </div>
      </div>

      {/* GP Summary */}
      <div>
        <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">GP Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
            <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Current GP%</p>
            <p className={`text-2xl font-light ${currentGP >= 40 ? 'text-emerald-400' : currentGP >= 35 ? 'text-amber-400' : 'text-red-400'}`}>
              {currentGP.toFixed(1)}%
            </p>
            <p className="text-2xs text-fg-muted mt-1">Based on invoiced to date</p>
          </div>
          <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
            <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Forecast GP%</p>
            <p className={`text-2xl font-light ${forecastGP >= 40 ? 'text-emerald-400' : forecastGP >= 35 ? 'text-amber-400' : 'text-red-400'}`}>
              {forecastGP.toFixed(1)}%
            </p>
            <p className="text-2xs text-fg-muted mt-1">Based on budget cost vs contract</p>
          </div>
        </div>
      </div>

      {/* Cost & Revenue Forecast */}
      <div>
        <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">Cost & Revenue Forecast</h3>
        <table className="w-full text-sm font-light">
          <thead>
            <tr className="border-b border-fg-border">
              <th className="text-left pb-2 text-2xs text-fg-muted tracking-wide uppercase">Item</th>
              <th className="text-right pb-2 text-2xs text-fg-muted tracking-wide uppercase">Budget</th>
              <th className="text-right pb-2 text-2xs text-fg-muted tracking-wide uppercase">Actual</th>
              <th className="text-right pb-2 text-2xs text-fg-muted tracking-wide uppercase">Forecast</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fg-border/50">
            <tr>
              <td className="py-2 text-fg-muted">Revenue</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(effectiveContract)}</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(totalInvoiced)}</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(effectiveContract)}</td>
            </tr>
            <tr>
              <td className="py-2 text-fg-muted">Cost</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(budgetCost)}</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(actualCost)}</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(forecastCost || budgetCost)}</td>
            </tr>
            <tr>
              <td className="py-2 text-fg-muted">GP</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(effectiveContract - budgetCost)}</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(totalInvoiced - actualCost)}</td>
              <td className="py-2 text-right text-fg-heading">{formatCurrency(effectiveContract - (forecastCost || budgetCost))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cash Position */}
      <div>
        <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">Cash Position</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
            <p className="text-2xs text-fg-muted tracking-wide uppercase mb-3">Cash In</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-light">
                <span className="text-fg-muted">Invoiced to Date</span>
                <span className="text-fg-heading">{formatCurrency(totalInvoiced)}</span>
              </div>
              <div className="flex justify-between text-sm font-light">
                <span className="text-fg-muted">Claims Total</span>
                <span className="text-fg-heading">{formatCurrency(totalClaimed)}</span>
              </div>
              <div className="flex justify-between text-sm font-light border-t border-fg-border pt-2">
                <span className="text-fg-muted">Remaining</span>
                <span className="text-fg-heading">{formatCurrency(effectiveContract - totalInvoiced)}</span>
              </div>
            </div>
          </div>
          <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
            <p className="text-2xs text-fg-muted tracking-wide uppercase mb-3">Cash Out</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-light">
                <span className="text-fg-muted">Actual Cost</span>
                <span className="text-fg-heading">{formatCurrency(actualCost)}</span>
              </div>
              <div className="flex justify-between text-sm font-light">
                <span className="text-fg-muted">Budget Cost</span>
                <span className="text-fg-heading">{formatCurrency(budgetCost)}</span>
              </div>
              <div className="flex justify-between text-sm font-light border-t border-fg-border pt-2">
                <span className="text-fg-muted">Variance</span>
                <span className={budgetCost - actualCost >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {formatCurrency(budgetCost - actualCost)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Labour */}
      {allowedLabourHours > 0 && (
        <div>
          <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">Labour</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* Hours */}
            <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
              <p className="text-2xs text-fg-muted tracking-wide uppercase mb-3">Hours</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-light">
                  <span className="text-fg-muted">Allowed (estimate)</span>
                  <span className="text-fg-heading tabular-nums">{fmtHrs(allowedLabourHours)}</span>
                </div>
                <div className="flex justify-between text-sm font-light">
                  <span className="text-fg-muted">Used to date</span>
                  <span className="text-fg-heading tabular-nums">{fmtHrs(usedLabourHours)}</span>
                </div>
                <div className="flex justify-between text-sm font-light border-t border-fg-border pt-2">
                  <span className="text-fg-muted">Remaining</span>
                  <span className={`tabular-nums ${remainingLabourHours < 0 ? 'text-red-400' : 'text-fg-heading'}`}>{fmtHrs(remainingLabourHours)}</span>
                </div>
              </div>
            </div>
            {/* Labour cost */}
            <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
              <p className="text-2xs text-fg-muted tracking-wide uppercase mb-3">Labour Cost</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-light">
                  <span className="text-fg-muted">Allowed</span>
                  <span className="text-fg-heading">{formatCurrency(allowedLabourCost)}</span>
                </div>
                <div className="flex justify-between text-sm font-light">
                  <span className="text-fg-muted">Used to date</span>
                  <span className="text-fg-heading">{formatCurrency(usedLabourCost)}</span>
                </div>
                <div className="flex justify-between text-sm font-light border-t border-fg-border pt-2">
                  <span className="text-fg-muted">Variance</span>
                  <span className={allowedLabourCost - usedLabourCost >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatCurrency(allowedLabourCost - usedLabourCost)}</span>
                </div>
              </div>
            </div>
          </div>
          {/* Hours consumed bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs font-light text-fg-muted mb-1">
              <span>Labour hours used vs allowed</span>
              <span className={labourOver ? 'text-red-400' : ''}>{labourHoursPct.toFixed(1)}%{labourOver ? ' · OVER' : ''}</span>
            </div>
            <div className="h-1.5 bg-fg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${labourOver ? 'bg-red-400/60' : labourBarPct > 90 ? 'bg-amber-400/60' : 'bg-emerald-400/60'}`}
                style={{ width: `${labourBarPct}%` }}
              />
            </div>
            {labourAheadOfBilling && (
              <p className="text-2xs text-amber-500 mt-1.5">
                Labour ahead of billing — {labourHoursPct.toFixed(0)}% of hours used vs {wipRatio.toFixed(0)}% invoiced.
              </p>
            )}
          </div>
        </div>
      )}

      {/* WIP / Completion */}
      <div>
        <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">WIP / Completion</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs font-light text-fg-muted mb-1">
              <span>Revenue invoiced vs contract</span>
              <span className={isOverInvoiced ? 'text-red-400' : ''}>
                {wipRatio.toFixed(1)}%{isOverInvoiced ? ' · OVER' : ''}
              </span>
            </div>
            <div className="h-1.5 bg-fg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isOverInvoiced ? 'bg-red-400/60' : 'bg-fg-heading/60'}`}
                style={{ width: `${wipPercent}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs font-light text-fg-muted mb-1">
              <span>Cost actual vs budget</span>
              <span className={isOverBudget ? 'text-red-400' : ''}>
                {costRatio.toFixed(1)}%{isOverBudget ? ' · OVER' : ''}
              </span>
            </div>
            <div className="h-1.5 bg-fg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isOverBudget ? 'bg-red-400/60' : costPercent > 90 ? 'bg-amber-400/60' : 'bg-emerald-400/60'}`}
                style={{ width: `${costPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {/* GP alert is only meaningful once enough has been invoiced — early-stage jobs almost always show
          a large negative currentGP because supplier costs hit before claims do. Gate at 20% of contract. */}
      {(() => {
        const invoicedShare = effectiveContract > 0 ? totalInvoiced / effectiveContract : 0
        const gpAlertActive = currentGP < 15 && currentGP !== 0 && invoicedShare >= 0.2
        const costAlertActive = costPercent > 90
        if (!gpAlertActive && !costAlertActive) return null
        return (
        <div>
          <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">Alerts</h3>
          <div className="space-y-2">
            {gpAlertActive && (
              <div className="bg-red-900/20 border border-red-400/30 rounded-sm px-4 py-3">
                <p className="text-xs font-light text-red-400">GP% is below 15% threshold ({currentGP.toFixed(1)}%)</p>
              </div>
            )}
            {costAlertActive && (
              <div className="bg-amber-900/20 border border-amber-400/30 rounded-sm px-4 py-3">
                <p className="text-xs font-light text-amber-400">Cost tracking at {costPercent.toFixed(0)}% of budget</p>
              </div>
            )}
          </div>
        </div>
        )
      })()}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'operations' | 'position' | 'costs' | 'revenue' | 'estimates' | 'notes' | 'gantt' | 'costtracker' | 'subcontractors'

// Ordered to follow the project lifecycle: define (Overview/Estimates) → plan (Gantt) →
// monitor (Position/Costs/Cost Tracker/Revenue/Subcontractors) → admin (Notes) → bill (Invoicing).
// The Gantt drives the cost + revenue model, so it sits up front near the estimate it's built from;
// Invoicing is the last step, so it sits at the end.
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview',     label: 'Overview' },
  { id: 'estimates',    label: 'Estimates' },
  { id: 'gantt',        label: 'Gantt' },
  { id: 'position',     label: 'Position' },
  { id: 'costs',        label: 'Costs (Xero)' },  // Live Xero cost feed + per-account forecast override
  { id: 'costtracker',  label: 'Cost Tracker' },
  { id: 'revenue',      label: 'Revenue' },
  { id: 'subcontractors', label: 'Subcontractors' },
  { id: 'notes',        label: 'Notes' },
  { id: 'operations',   label: 'Invoicing' },
]

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : ''

  const [project, setProject] = useState<Project | null>(null)
  const [revenueEntries, setRevenueEntries] = useState<WeeklyRevenue[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [ganttEntries, setGanttEntries] = useState<GanttEntry[]>([])
  const [actuals, setActuals] = useState<WeeklyActual[]>([])
  const [progressClaims, setProgressClaims] = useState<ProgressClaim[]>([])
  const [stages, setStages] = useState<ProgressPaymentStage[]>([])
  // Seed from ?tab= so deep links from the dashboard Live Jobs row land on the right tab.
  // Falls back to 'overview' if no/invalid tab param.
  const tabFromUrl = searchParams?.get('tab') as TabId | null
  const validInitialTab: TabId = TABS.some(t => t.id === tabFromUrl) ? (tabFromUrl as TabId) : 'overview'
  const [activeTab, setActiveTab] = useState<TabId>(validInitialTab)
  const [notesValue, setNotesValue] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [copied, setCopied] = useState(false)

  // Load all data
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      let found = loadProjects().find(p => p.id === id)
      if (!found) {
        // Local copy may have been cleared — fall back to Supabase and restore it locally
        found = (await getProjects()).find(p => p.id === id)
        if (found) saveProject(found)
      }
      if (cancelled) return
      if (!found) { router.push('/projects'); return }
      setNotesValue(found.notes || '')
    // Auto-initialise or fix stage checklist
    const loaded = found
    const currentStage: ProjectStage = (loaded.stage as ProjectStage) || defaultStageForStatus(loaded.status || 'planning')
    const existingChecklist = (loaded.stageChecklist as any[]) || []
    // Checklist is stale if: missing, empty, or its IDs don't start with the current stage prefix
    const checklistIsStale = existingChecklist.length === 0 ||
      !existingChecklist[0]?.id?.startsWith(currentStage)
    if (checklistIsStale) {
      const fixed = { ...loaded, stage: currentStage, stageChecklist: buildChecklist(currentStage) }
      saveProject(fixed)
      setProject(fixed)
    } else {
      setProject({ ...loaded, stage: currentStage })
    }
    setRevenueEntries(loadWeeklyRevenue().filter(r => r.projectId === id))
    setEstimates(loadEstimates().filter(e => e.projectId === id))
      setGanttEntries(loadGanttEntries(id))
      setActuals(loadWeeklyActuals(id))
      setProgressClaims(loadProgressClaims(id))
      setStages(loadProgressPaymentStages(id))
      // Pull any client variation approvals/rejections down from Supabase, then refresh the estimates.
      const changed = await reconcileVariations()
      if (changed > 0 && !cancelled) setEstimates(loadEstimates().filter(e => e.projectId === id))
    })()
    return () => { cancelled = true }
  }, [id, router])

  // Auto-save notes
  const saveNotes = useCallback(() => {
    if (!project) return
    const updated = { ...project, notes: notesValue }
    void upsertProject(updated) // localStorage + Supabase, so the edit reaches other devices
    setProject(updated)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }, [project, notesValue])

  const handleDelete = () => {
    if (!project) return
    // Delete from Supabase too — otherwise the add-missing sync resurrects it on the next load.
    void deleteProjectAsync(project.id)
    router.push('/projects')
  }

  const handleCreateVariation = (parentEstimate: Estimate) => {
    if (!project) return
    const variationCount = estimates.filter(
      e => e.parentEstimateId === parentEstimate.id
    ).length
    const variation: Estimate = {
      id: generateId(),
      projectId: project.id,
      projectName: project.name,
      name: `VMO-${variationCount + 1}`,
      version: 1,
      status: 'variation',
      defaultMarkupFormation: parentEstimate.defaultMarkupFormation,
      defaultMarkupSubcontractor: parentEstimate.defaultMarkupSubcontractor,
      lineItems: [],
      parentEstimateId: parentEstimate.id,
      variationNumber: variationCount + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    saveEstimate(variation)
    setEstimates(loadEstimates().filter(e => e.projectId === id))
    router.push(`/estimates/${variation.id}`)
  }

  const handleCopyForemanLink = () => {
    if (!project?.foremanPin) return
    const url = `${window.location.origin}/foreman/${project.foremanPin}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleStageChange = (newStage: ProjectStage) => {
    if (!project) return
    const warning = PROGRESSION_WARNINGS[newStage]
    if (warning) {
      const currentChecklist = project.stageChecklist || []
      const incomplete = warning.checks.filter(check =>
        !((currentChecklist as any[]).find((item: any) => item.label === check && item.completed))
      )
      if (incomplete.length > 0 && !window.confirm(warning.message)) return
    }
    // Capture programme baseline when going Active (only once)
    let programmeBaselineUpdate = {}
    if (newStage === 'active' && project.baseline && !project.baseline.plannedStart) {
      programmeBaselineUpdate = {
        baseline: {
          ...project.baseline,
          plannedStart: project.startDate || new Date().toISOString().split('T')[0],
          plannedCompletion: project.plannedCompletion || '',
        }
      }
    }

    const newChecklist = buildChecklist(newStage)
    const updated = { ...project, stage: newStage, stageChecklist: newChecklist, ...programmeBaselineUpdate }
    void upsertProject(updated) // localStorage + Supabase
    setProject(updated)
  }

  const handleToggleChecklistItem = (itemId: string) => {
    if (!project) return
    const updated = {
      ...project,
      stageChecklist: (project.stageChecklist || []).map((item: any) =>
        item.id === itemId ? { ...item, completed: !item.completed } : item
      ),
    }
    void upsertProject(updated) // localStorage + Supabase
    setProject(updated)
  }

  const handleNextActionChange = (value: string) => {
    setProject((prev: any) => prev ? { ...prev, nextAction: value } : prev)
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-fg-bg flex items-center justify-center">
        <p className="text-fg-muted font-light">Loading…</p>
      </div>
    )
  }

  // Revised contract = original contract + accepted (non-archived) variations — matches
  // computeLiveJobRow so the Overview agrees with the Position tab + dashboard.
  const acceptedVariations = estimates.filter(e => !!e.parentEstimateId && e.status === 'accepted' && !e.archived)
  const variationsTotal = acceptedVariations.reduce((s, v) => s + variationContractValue(v), 0)
  const revisedContract = (project.contractValue || 0) + variationsTotal

  // Build estimate tree (parent → variations)
  const parentEstimates = estimates.filter(e => !e.parentEstimateId)
  const variationsByParent: Record<string, Estimate[]> = {}
  estimates.filter(e => e.parentEstimateId).forEach(v => {
    if (!variationsByParent[v.parentEstimateId!]) variationsByParent[v.parentEstimateId!] = []
    variationsByParent[v.parentEstimateId!].push(v)
  })

  const totalRevenuePlanned = revenueEntries.reduce((sum, r) => sum + (r.plannedRevenue ?? 0), 0)
  const totalInvoiced = revenueEntries.reduce((sum, r) => sum + (r.actualInvoiced ?? 0), 0)

  return (
    <div className="min-h-screen bg-fg-bg">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-light text-fg-muted mb-6">
          <Link href="/projects" className="hover:text-fg-heading transition-colors">Projects</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-fg-heading">{project.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-start gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-light text-fg-heading tracking-wide">{project.name}</h1>
                <EntityBadge entity={project.entity} />
                <span className={`text-2xs px-2 py-1 rounded-sm font-medium uppercase tracking-wide ${
                  STAGE_COLOURS[(project.stage as ProjectStage) || 'estimating']
                }`}>
                  {STAGE_LABELS[(project.stage as ProjectStage) || 'estimating']}
                </span>
                <span className="text-sm font-light text-fg-muted" title={variationsTotal !== 0 ? `${formatCurrency(project.contractValue)} + ${formatCurrency(variationsTotal)} variations` : undefined}>{formatCurrency(revisedContract)}</span>
                {(() => {
                  const { status, daysSlippage } = scheduleStatus(project)
                  if (!project.baseline?.plannedCompletion) return null
                  const dot = healthBg(status)
                  const col = healthColour(status)
                  return (
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${dot} inline-block`} />
                      <span className={`text-2xs font-medium ${col}`}>
                        {status === 'green' ? 'On schedule' : status === 'amber' ? `${daysSlippage}d behind` : `${daysSlippage}d delayed`}
                      </span>
                    </div>
                  )
                })()}
              </div>
              <p className="text-sm font-light text-fg-muted">{project.clientName} · {project.address}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/projects/${id}/report`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-fg-heading hover:border-fg-heading/40 transition-colors"
            >
              Financial report
            </Link>
            <Link
              href={`/projects/${id}/edit`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-fg-heading hover:border-fg-heading/40 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </Link>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-red-400 hover:border-red-400/40 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-fg-bg border border-fg-border rounded-sm p-6 max-w-sm w-full mx-4">
              <h2 className="text-sm font-light text-fg-heading mb-2">Delete Project?</h2>
              <p className="text-xs font-light text-fg-muted mb-6">
                This will permanently delete <strong className="text-fg-heading">{project.name}</strong>. This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-fg-heading transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-xs font-light tracking-wide uppercase bg-red-900/40 border border-red-400/40 text-red-400 rounded-sm hover:bg-red-900/60 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-fg-border mb-8 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-light tracking-wide uppercase whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-fg-dark text-white/80'
                  : 'text-fg-muted hover:text-fg-heading'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ─────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Metadata grid */}
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Start Date</p>
                <p className="text-sm font-light text-fg-heading">{formatProjectDate(project.startDate)}</p>
              </div>
              <div>
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Target Completion</p>
                <p className="text-sm font-light text-fg-heading">{formatProjectDate(project.plannedCompletion)}</p>
              </div>
              <div>
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Entity</p>
                <EntityBadge entity={project.entity} />
              </div>
              <div>
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Status</p>
                <StatusPill status={project.status} />
              </div>
              <div>
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Foreman</p>
                <p className="text-sm font-light text-fg-heading">{project.foreman || '—'}</p>
              </div>
              <div>
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Contract Value</p>
                <p className="text-sm font-light text-fg-heading">{formatCurrency(revisedContract)}</p>
                {variationsTotal !== 0 && (
                  <p className="text-2xs font-light text-fg-muted/70 mt-0.5">{formatCurrency(project.contractValue)} + {formatCurrency(variationsTotal)} variations</p>
                )}
              </div>
              <div>
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Invoice Method</p>
                <button
                  onClick={() => {
                    const next = project.invoiceModel === 'progress_claim' ? 'stage_based' : 'progress_claim'
                    const updated = { ...project, invoiceModel: next as 'stage_based' | 'progress_claim' }
                    void upsertProject(updated) // localStorage + Supabase
                    setProject(updated)
                  }}
                  className="text-sm font-light text-fg-heading hover:text-fg-dark transition-colors border-b border-dashed border-fg-border/60 pb-px"
                  title="Click to toggle"
                >
                  {project.invoiceModel === 'progress_claim' ? 'Progress Claims' : 'Stage-Based'}
                </button>
              </div>
            </div>

            {/* Scopes — shown if project has multi-scope structure */}
            {project.scopes && project.scopes.length > 0 && (
              <div className="mt-4">
                <p className="text-2xs text-fg-muted tracking-wide uppercase mb-2">Project Scopes</p>
                <div className="flex flex-wrap gap-2">
                  {(project.scopes as ProjectScope[]).map(scope => (
                    <div key={scope.id} className="flex items-center gap-2 border border-fg-border px-3 py-2 rounded-sm">
                      <span className="text-xs font-medium text-fg-heading">{scope.name}</span>
                      <span className="text-2xs text-fg-muted">·</span>
                      <span className="text-2xs text-fg-muted">{scope.entity === 'formation' ? 'Formation' : scope.entity === 'lume' ? 'Lume Pools' : 'Design'}</span>
                      <span className="text-2xs text-fg-muted">·</span>
                      <span className="text-2xs text-fg-muted">{scope.invoiceModel === 'progress_claim' ? 'Progress Claims' : 'Stage-Based'}</span>
                      {scope.contractValue && scope.contractValue > 0 && (
                        <>
                          <span className="text-2xs text-fg-muted">·</span>
                          <span className="text-2xs font-light text-fg-heading tabular-nums">{(scope.contractValue).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invoice summary — contract / invoiced / remaining */}
            {(() => {
              const invoicedToDate = progressClaims
                .filter(c => c.status === 'sent' || c.status === 'paid')
                .reduce((s, c) => s + c.subtotalEx, 0)
              const remaining = Math.max(0, revisedContract - invoicedToDate)
              return (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
                    <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Contract Value</p>
                    <p className="text-lg font-light text-fg-heading">{formatCurrency(revisedContract)}</p>
                    {variationsTotal !== 0 && <p className="text-2xs text-fg-muted/70 mt-0.5">incl. {formatCurrency(variationsTotal)} variations</p>}
                  </div>
                  <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
                    <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Invoiced to Date</p>
                    <p className="text-lg font-light text-fg-heading">{formatCurrency(invoicedToDate)}</p>
                  </div>
                  <div className="bg-fg-bg border border-fg-border rounded-sm p-4">
                    <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Remaining</p>
                    <p className={`text-lg font-light ${remaining > 0 ? 'text-fg-heading' : 'text-emerald-600'}`}>
                      {remaining > 0 ? formatCurrency(remaining) : '✓ Fully invoiced'}
                    </p>
                  </div>
                </div>
              )
            })()}


            {/* Project Health */}
            {(() => {
              const health = calcProjectHealth(project, estimates, ganttEntries, actuals)
              const dot = healthBg(health.status)
              const textCol = healthColour(health.status)
              const borderCol = healthBorder(health.status)
              const statusLabel = health.status === 'green' ? 'On Track' : health.status === 'amber' ? 'Watch' : 'Needs Attention'
              return (
                <div className={`mt-4 border ${borderCol} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${dot} inline-block`} />
                      <p className="text-2xs font-medium tracking-architectural uppercase text-fg-muted">Project Health</p>
                    </div>
                    <span className={`text-2xs font-semibold uppercase tracking-wide ${textCol}`}>{statusLabel}</span>
                  </div>
                  {/* Variance grid */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {health.forecastGP !== null && (
                      <div>
                        <p className="text-2xs text-fg-muted mb-0.5">Forecast GP%</p>
                        <p className={`text-sm font-light tabular-nums ${health.forecastGP >= 40 ? 'text-green-600' : health.forecastGP >= 35 ? 'text-amber-500' : 'text-red-500'}`}>
                          {health.forecastGP.toFixed(1)}%
                          {health.gpVariance !== null && (
                            <span className={`ml-1 text-2xs ${health.gpVariance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              ({health.gpVariance >= 0 ? '+' : ''}{health.gpVariance.toFixed(1)}%)
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    {health.costVariancePct !== null && (
                      <div>
                        <p className="text-2xs text-fg-muted mb-0.5">Cost vs Baseline</p>
                        <p className={`text-sm font-light tabular-nums ${health.costVariancePct <= 0 ? 'text-green-600' : health.costVariancePct <= 5 ? 'text-amber-500' : 'text-red-500'}`}>
                          {health.costVariancePct >= 0 ? '+' : ''}{health.costVariancePct.toFixed(1)}%
                        </p>
                      </div>
                    )}
                    {health.daysSlippage !== null && (
                      <div>
                        <p className="text-2xs text-fg-muted mb-0.5">Schedule</p>
                        <p className={`text-sm font-light tabular-nums ${health.daysSlippage <= 0 ? 'text-green-600' : health.daysSlippage <= 7 ? 'text-amber-500' : 'text-red-500'}`}>
                          {health.daysSlippage <= 0 ? `${Math.abs(health.daysSlippage)}d early` : `+${health.daysSlippage}d`}
                        </p>
                      </div>
                    )}
                  </div>
                  {/* Flags */}
                  {health.flags.length > 0 && (
                    <div className="space-y-1">
                      {health.flags.map((flag, i) => (
                        <p key={i} className={`text-2xs font-medium ${healthColour(flag.status)}`}>
                          {flag.status === 'red' ? '⚠' : '△'} {flag.reason}
                        </p>
                      ))}
                    </div>
                  )}
                  {health.flags.length === 0 && health.forecastGP !== null && (
                    <p className="text-2xs text-green-600">✓ No issues identified</p>
                  )}
                  {health.forecastGP === null && (
                    <p className="text-2xs text-fg-muted/60">Accept an estimate to enable health tracking</p>
                  )}
                </div>
              )
            })()}

            {/* Stage & Workflow */}
            <div className="mt-6 border border-fg-border">
              {/* Stage selector */}
              <div className="px-5 py-4 border-b border-fg-border">
                <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-3">Project Stage</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAGE_ORDER.map((s, i) => {
                    const currentIdx = STAGE_ORDER.indexOf((project.stage as ProjectStage) || 'estimating')
                    const isActive = s === ((project.stage as ProjectStage) || 'estimating')
                    const isPast = i < currentIdx
                    return (
                      <button
                        key={s}
                        onClick={() => handleStageChange(s)}
                        className={`px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide rounded-sm transition-all ${
                          isActive
                            ? STAGE_COLOURS[s] + ' ring-2 ring-offset-1 ring-current shadow-sm scale-105'
                            : isPast
                              ? 'bg-fg-border/30 text-fg-muted/50 line-through'
                              : 'border border-fg-border/40 text-fg-muted/40 hover:text-fg-muted hover:border-fg-border'
                        }`}
                      >
                        {i + 1}. {STAGE_LABELS[s]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Checklist */}
              {(project.stageChecklist as any[] || []).length > 0 && (() => {
                const checklist = project.stageChecklist as any[]
                const done = checklist.filter((i: any) => i.completed).length
                const total = checklist.length
                const allDone = done === total
                const pct = Math.round((done / total) * 100)
                return (
                  <div className="border-b border-fg-border">
                    {/* Checklist header with progress bar */}
                    <div className="px-5 py-2.5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 flex-1">
                        <p className="text-2xs text-fg-muted whitespace-nowrap">
                          {STAGE_LABELS[(project.stage as ProjectStage) || 'estimating']} checklist
                        </p>
                        <div className="flex-1 h-1 bg-fg-border/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${allDone ? 'bg-emerald-500' : done > 0 ? 'bg-amber-400' : 'bg-fg-border'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className={`text-2xs font-medium whitespace-nowrap ${allDone ? 'text-emerald-600' : 'text-fg-muted'}`}>
                        {allDone ? '✓ Complete' : `${done}/${total}`}
                      </span>
                    </div>
                    {/* Checklist items */}
                    {checklist.map((item: any) => (
                      <label key={item.id} className="flex items-center gap-3 px-5 py-2.5 border-t border-fg-border/20 cursor-pointer hover:bg-fg-card/20 transition-colors">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => handleToggleChecklistItem(item.id)}
                          className="w-4 h-4 accent-fg-dark rounded"
                        />
                        <span className={`text-xs font-light ${item.completed ? 'line-through text-fg-muted/50' : 'text-fg-heading'}`}>
                          {item.label}
                        </span>
                        {item.completed && <span className="ml-auto text-emerald-500 text-xs">✓</span>}
                      </label>
                    ))}
                  </div>
                )
              })()}

              {/* Next Action */}
              <div className="px-5 py-4">
                <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Next Action</label>
                <input
                  type="text"
                  value={(project.nextAction as string) || ''}
                  onChange={e => handleNextActionChange(e.target.value)}
                  onBlur={() => { void upsertProject(project) }}
                  placeholder="e.g. Confirm start date, Review budget variance, Await client approval"
                  className="w-full bg-transparent border-b border-fg-border text-sm font-light text-fg-heading outline-none py-1.5 focus:border-fg-heading transition-colors placeholder-fg-muted/30"
                />
              </div>
            </div>

            {/* Foreman Access */}
            {project.foremanPin && (
              <div>
                <h3 className="text-xs font-light tracking-widest uppercase text-fg-muted mb-3">Foreman Access</h3>
                <div className="bg-fg-bg border border-fg-border rounded-sm p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Access PIN</p>
                      <p className="text-sm font-mono font-light text-fg-heading">{project.foremanPin}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-2xs text-fg-muted tracking-wide uppercase mb-1">Foreman URL</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-light text-fg-muted bg-fg-border/20 px-2 py-1 rounded-sm">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/foreman/{project.foremanPin}
                      </code>
                      <button
                        onClick={handleCopyForemanLink}
                        className="flex items-center gap-1.5 px-2 py-1 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-fg-heading transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Operations ───────────────────────────────────────────────── */}
        {activeTab === 'operations' && (
          <div>
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-fg-border">
            <div>
              <p className="text-xs font-light text-fg-heading">
                {project.invoiceModel === 'progress_claim' ? 'Progress Claims' : 'Stage-Based Invoicing'}
              </p>
              <p className="text-2xs text-fg-muted mt-0.5">
                {project.invoiceModel === 'progress_claim'
                  ? 'Claim against estimate categories as work is completed'
                  : 'Invoice by milestone stage (deposit, balance, completion)'}
              </p>
            </div>
            <button
              onClick={() => {
                const next = project.invoiceModel === 'progress_claim' ? 'stage_based' : 'progress_claim'
                const updated = { ...project, invoiceModel: next as 'stage_based' | 'progress_claim' }
                void upsertProject(updated) // localStorage + Supabase
                setProject(updated)
              }}
              className="text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted px-3 py-1.5 hover:text-fg-heading hover:border-fg-heading/40 transition-colors"
            >
              Switch to {project.invoiceModel === 'progress_claim' ? 'Stage-Based' : 'Progress Claims'}
            </button>
          </div>
          <FinancialOperations
            projectId={project.id}
            projectName={project.name}
            clientName={project.clientName || ''}
            entity={project.entity}
            stages={stages}
            estimates={estimates}
            onStagesChange={(newStages) => setStages(newStages)}
            onEstimatesChange={() => setEstimates(loadEstimates().filter(e => e.projectId === id))}
          />
          </div>
        )}

        {/* ── Tab: Position ─────────────────────────────────────────────────── */}
        {activeTab === 'position' && (
          <ProjectFinancialPosition
            project={project}
            estimates={estimates}
            ganttEntries={ganttEntries}
            actuals={actuals}
            revenueEntries={revenueEntries}
            progressClaims={progressClaims}
            onAddEstimate={() => router.push(`/estimates/new?projectId=${id}`)}
            onSetupGantt={() => router.push(`/projects/${id}/gantt`)}
          />
        )}

        {/* ── Tab: Costs (Xero) ─────────────────────────────────────────────── */}
        {activeTab === 'costs' && (() => {
          // Compute effective contract (incl. variations) so the GP line at the bottom
          // of the costs tab matches the Position tab and the dashboard Live Jobs row.
          const acceptedBase = estimates.filter(e => e.status === 'accepted' && !e.parentEstimateId)
          const acceptedVariations = estimates.filter(e => e.status === 'accepted' && !!e.parentEstimateId)
          const baseContract = acceptedBase.reduce(
            (s, e) => s + getEstimateTotals(e).totalRevenue, 0,
          )
          const variationsTotal = acceptedVariations.reduce((s, e) => s + variationContractValue(e), 0)
          const revisedContract = baseContract + variationsTotal
          const effectiveContract = revisedContract > 0 ? revisedContract : (project.contractValue || 0)
          // Flatten all accepted estimate line items so labour-allowance + pace can read them.
          // We pass all accepted (base + variations) so labour added by a variation is included.
          const allLineItems = estimates
            .filter(e => e.status === 'accepted')
            .flatMap(e => e.lineItems)
          return (
            <ProjectCostsTab
              projectId={id}
              projectName={project.name}
              forecastRevenue={effectiveContract}
              quotedMarginPct={project.baseline?.gpPercent}
              targetMarginPct={getTargetMarginPct(project)}
              estimateLineItems={allLineItems}
              foremanActuals={actuals}
              projectStartDate={project.startDate}
            />
          )
        })()}

        {/* ── Tab: Revenue ──────────────────────────────────────────────────── */}
        {activeTab === 'revenue' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-light tracking-widest uppercase text-fg-muted">Revenue Schedule</h2>
              <Link
                href={`/revenue?projectId=${id}`}
                className="text-xs font-light text-fg-muted hover:text-fg-heading transition-colors flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Open in Revenue
              </Link>
            </div>
            {revenueEntries.length === 0 ? (
              <p className="text-fg-muted font-light text-sm py-8 text-center">No revenue entries yet. Set up the Gantt to generate a schedule.</p>
            ) : (() => {
              // Reshape the per-week Gantt forecast into a Task × Month matrix: one row per task,
              // a column per calendar month, each cell the planned revenue falling in that month.
              const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
              const stripGantt = (s: string) => (s || '').replace(/\s*\(Gantt\)\s*$/i, '').trim() || 'Unallocated'
              const monthKey = (iso: string) => iso.slice(0, 7)
              const monthLabel = (key: string) => { const [y, m] = key.split('-'); return `${MONTHS[Number(m) - 1]} ${y}` }

              const validEntries = revenueEntries.filter(e => typeof e.weekEnding === 'string' && e.weekEnding.length >= 7)
              const months = Array.from(new Set(validEntries.map(e => monthKey(e.weekEnding)))).sort()
              const order: string[] = []
              const byTask = new Map<string, { months: Record<string, number>; total: number; deposit: boolean; first: string }>()
              for (const e of validEntries) {
                const task = stripGantt(e.notes || '')
                const mk = monthKey(e.weekEnding)
                if (!byTask.has(task)) { byTask.set(task, { months: {}, total: 0, deposit: false, first: e.weekEnding }); order.push(task) }
                const row = byTask.get(task)!
                row.months[mk] = (row.months[mk] || 0) + (e.plannedRevenue || 0)
                row.total += e.plannedRevenue || 0
                if (e.isDeposit) row.deposit = true
                if (e.weekEnding < row.first) row.first = e.weekEnding
              }
              order.sort((a, b) => byTask.get(a)!.first.localeCompare(byTask.get(b)!.first))
              const monthTotal = (mk: string) => order.reduce((s, t) => s + (byTask.get(t)!.months[mk] || 0), 0)

              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm font-light border-collapse">
                    <thead>
                      <tr className="border-b border-fg-border">
                        <th className="text-left pb-2 pr-4 text-2xs text-fg-muted tracking-wide uppercase">Task</th>
                        {months.map(mk => (
                          <th key={mk} className="text-right pb-2 px-3 text-2xs text-fg-muted tracking-wide uppercase whitespace-nowrap">{monthLabel(mk)}</th>
                        ))}
                        <th className="text-right pb-2 pl-4 text-2xs text-fg-muted tracking-wide uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-fg-border/40">
                      {order.map(task => {
                        const row = byTask.get(task)!
                        return (
                          <tr key={task}>
                            <td className="py-2 pr-4 text-fg-heading whitespace-nowrap">
                              {task}
                              {row.deposit && <span className="ml-2 text-2xs text-fg-muted border border-fg-border rounded-sm px-1 py-0.5 uppercase tracking-wide">Deposit</span>}
                            </td>
                            {months.map(mk => (
                              <td key={mk} className="py-2 px-3 text-right tabular-nums">
                                {row.months[mk] ? <span className="text-fg-heading">{formatCurrency(row.months[mk])}</span> : <span className="text-fg-muted/30">—</span>}
                              </td>
                            ))}
                            <td className="py-2 pl-4 text-right text-fg-heading tabular-nums font-normal">{formatCurrency(row.total)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-fg-border">
                        <td className="py-2 pr-4 text-2xs text-fg-muted uppercase tracking-wide">Monthly total</td>
                        {months.map(mk => (
                          <td key={mk} className="py-2 px-3 text-right text-fg-heading tabular-nums">{formatCurrency(monthTotal(mk))}</td>
                        ))}
                        <td className="py-2 pl-4 text-right text-fg-heading tabular-nums font-normal">{formatCurrency(totalRevenuePlanned)}</td>
                      </tr>
                      {totalInvoiced > 0 && (
                        <tr>
                          <td className="py-1 pr-4 text-2xs text-fg-muted uppercase tracking-wide">Invoiced to date</td>
                          {months.length > 0 && <td colSpan={months.length} />}
                          <td className="py-1 pl-4 text-right text-fg-muted tabular-nums">{formatCurrency(totalInvoiced)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Tab: Estimates ────────────────────────────────────────────────── */}
        {activeTab === 'estimates' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-light tracking-widest uppercase text-fg-muted">Estimates</h2>
              <Link
                href={`/estimates/new?projectId=${id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-light tracking-wide uppercase bg-fg-dark text-white/80 rounded-sm hover:bg-fg-heading/80 transition-colors"
              >
                <Plus className="w-3 h-3" />
                New Estimate
              </Link>
            </div>
            {parentEstimates.length === 0 ? (
              <p className="text-fg-muted font-light text-sm py-8 text-center">No estimates yet.</p>
            ) : (
              <div className="space-y-2">
                {parentEstimates.map(est => {
                  const totalRevenue = est.lineItems.reduce((s, li) => s + li.revenue, 0)
                  const variations = variationsByParent[est.id] || []
                  return (
                    <div key={est.id}>
                      {/* Parent estimate row */}
                      <div className="flex items-center justify-between py-3 px-4 bg-fg-bg border border-fg-border rounded-sm">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="text-sm font-light text-fg-heading">{est.name || `Estimate v${est.version}`}</p>
                            <p className="text-2xs text-fg-muted">{formatProjectDate(est.createdAt)}</p>
                          </div>
                          <EstimateStatusBadge status={est.status} />
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-light text-fg-heading">{formatCurrency(totalRevenue)}</span>
                          {est.status === 'accepted' && (
                            <button
                              onClick={() => handleCreateVariation(est)}
                              className="flex items-center gap-1 px-2 py-1 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-fg-heading transition-colors"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              Variation
                            </button>
                          )}
                          <Link
                            href={`/estimates/${est.id}`}
                            className="flex items-center gap-1 px-2 py-1 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-fg-heading transition-colors"
                          >
                            Open
                            <ChevronRight className="w-2.5 h-2.5" />
                          </Link>
                        </div>
                      </div>

                      {/* Variations indented */}
                      {variations.map(vmo => {
                        const vmoRevenue = vmo.lineItems.reduce((s, li) => s + li.revenue, 0)
                        return (
                          <div key={vmo.id} className="flex items-center justify-between py-2 px-4 ml-8 border-l border-fg-border bg-fg-bg/50 border-r border-b border-b-fg-border/50 border-r-fg-border/50">
                            <div className="flex items-center gap-3">
                              <div>
                                <p className="text-xs font-light text-fg-heading">{vmo.name || `VMO-${vmo.variationNumber}`}</p>
                                <p className="text-2xs text-fg-muted">{vmo.variationReason || 'Variation'}</p>
                              </div>
                              <EstimateStatusBadge status={vmo.status} />
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-light text-fg-heading">{formatCurrency(vmo.variationAmount || vmoRevenue)}</span>
                              <Link
                                href={`/estimates/${vmo.id}`}
                                className="flex items-center gap-1 px-2 py-1 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted rounded-sm hover:text-fg-heading transition-colors"
                              >
                                Open
                                <ChevronRight className="w-2.5 h-2.5" />
                              </Link>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Notes ────────────────────────────────────────────────────── */}
        {activeTab === 'notes' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-light tracking-widest uppercase text-fg-muted">Project Notes</h2>
              {notesSaved && (
                <span className="text-2xs text-emerald-400 font-light">Saved</span>
              )}
            </div>
            <textarea
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              onBlur={saveNotes}
              rows={16}
              placeholder="Add project notes…"
              className="w-full bg-fg-bg border border-fg-border rounded-sm px-4 py-3 text-sm font-light text-fg-heading placeholder-fg-muted/50 resize-none focus:outline-none focus:border-fg-heading/40 transition-colors"
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={saveNotes}
                className="px-4 py-2 text-xs font-light tracking-wide uppercase bg-fg-dark text-white/80 rounded-sm hover:bg-fg-heading/80 transition-colors"
              >
                Save Notes
              </button>
            </div>
          </div>
        )}

        {/* ── Tab: Gantt ────────────────────────────────────────────────────── */}
        {activeTab === 'gantt' && (
          <GanttAutoRedirect projectId={id} ganttEntries={ganttEntries} />
        )}

        {/* ── Tab: Cost Tracker ─────────────────────────────────────────────── */}
        {activeTab === 'costtracker' && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <h2 className="text-sm font-light text-fg-heading">Cost Tracker</h2>
            <p className="text-xs font-light text-fg-muted max-w-sm">
              Track weekly actual costs against your budget. Enter supply, labour, and subcontractor costs by category.
            </p>
            <Link
              href={`/projects/${id}/actuals`}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-light tracking-wide uppercase bg-fg-dark text-white/80 rounded-sm hover:bg-fg-heading/80 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Cost Tracker
            </Link>
            {actuals.length > 0 && (
              <p className="text-2xs text-fg-muted">{actuals.length} week{actuals.length !== 1 ? 's' : ''} of data recorded</p>
            )}
          </div>
        )}

        {/* ── Tab: Subcontractors ── */}
        {activeTab === 'subcontractors' && (
          <SubcontractorsTab projectId={id} />
        )}

      </div>
    </div>
  )
}
