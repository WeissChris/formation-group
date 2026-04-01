﻿﻿﻿﻿'use client'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { loadProjects, loadWeeklyRevenue, saveWeeklyRevenue, deleteWeeklyRevenue, loadEstimates, loadProposals } from '@/lib/storage'
import {
  formatCurrency, getFridaysInMonth, getFinancialYear,
  generateId, snapToFriday, toISODate, formatDayMonth,
  MONTH_NAMES,
} from '@/lib/utils'
import type { Project, WeeklyRevenue, EntityType } from '@/types'
import EntityBadge from '@/components/EntityBadge'
import { ChevronLeft, ChevronRight, X, Plus } from 'lucide-react'

// ─── Constants ──────────────────────────────────────────────────────────────
const LUME_DEFAULT_GP = 28.6 // 40% markup = 28.6% GP margin
const GP_TARGET = 40

// ─── GP% Helpers ─────────────────────────────────────────────────────────────

function gpColor(gp: number | null): string {
  if (gp === null) return 'text-fg-muted'
  if (gp >= 40) return 'text-green-600'
  if (gp >= 35) return 'text-amber-500'
  return 'text-red-500'
}

function gpBarColor(gp: number | null): string {
  if (gp === null) return 'bg-fg-border'
  if (gp >= 40) return 'bg-green-500'
  if (gp >= 35) return 'bg-amber-400'
  return 'bg-red-400'
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isSameWeek(dateStr: string, friday: Date) {
  const d = new Date(dateStr)
  return d.toDateString() === friday.toDateString()
}

function isCurrentWeek(friday: Date): boolean {
  const now = new Date()
  const thisMonday = new Date(now)
  thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const thisFriday = new Date(thisMonday)
  thisFriday.setDate(thisMonday.getDate() + 4)
  return friday.toDateString() === thisFriday.toDateString()
}

function isPastWeek(friday: Date): boolean {
  const now = new Date()
  return friday < now && !isCurrentWeek(friday)
}

// ─── Add/Edit Modal ──────────────────────────────────────────────────────────

interface EntryModalProps {
  projects: Project[]
  initialProjectId?: string
  initialWeekEnding?: string
  entry?: WeeklyRevenue
  onSave: (entry: WeeklyRevenue) => void
  onDelete?: (id: string) => void
  onClose: () => void
}

function EntryModal({ projects, initialProjectId, initialWeekEnding, entry, onSave, onDelete, onClose }: EntryModalProps) {
  const activeProjects = projects.filter(p => p.status !== 'complete' && p.status !== 'invoiced')
  const [projectId, setProjectId] = useState(entry?.projectId ?? initialProjectId ?? activeProjects[0]?.id ?? '')
  const [weekEnding, setWeekEnding] = useState(
    entry?.weekEnding ?? initialWeekEnding ?? toISODate(snapToFriday(new Date()))
  )
  const [amount, setAmount] = useState(entry ? String(entry.plannedRevenue) : '')
  const [isDeposit, setIsDeposit] = useState(entry?.isDeposit ?? false)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [error, setError] = useState('')

  const handleDateChange = (val: string) => {
    if (!val) return
    const snapped = snapToFriday(new Date(val))
    setWeekEnding(toISODate(snapped))
  }

  const handleSave = () => {
    if (!projectId) return setError('Select a project')
    const num = parseFloat(amount.replace(/[^0-9.]/g, ''))
    if (isNaN(num) || num <= 0) return setError('Enter a valid amount')
    const proj = projects.find(p => p.id === projectId)
    if (!proj) return setError('Project not found')
    onSave({
      id: entry?.id ?? generateId(),
      projectId,
      projectName: proj.name,
      entity: proj.entity,
      weekEnding,
      weekNumber: 0,
      plannedRevenue: num,
      actualInvoiced: entry?.actualInvoiced ?? 0,
      isDeposit,
      notes,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-fg-darker/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-fg-bg border border-fg-border w-full sm:max-w-md mx-4 sm:mx-0 p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="text-sm font-light tracking-wide text-fg-heading uppercase">
            {entry ? 'Edit Entry' : 'Add Revenue Entry'}
          </h2>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-heading transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Project */}
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">
              Project
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors appearance-none"
            >
              {activeProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.entity}</option>
              ))}
            </select>
          </div>

          {/* Week ending */}
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">
              Week Ending (snaps to Friday)
            </label>
            <input
              type="date"
              value={weekEnding}
              onChange={e => handleDateChange(e.target.value)}
              className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">
              Amount ($)
            </label>
            <input
              type="text"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors tabular-nums"
            />
          </div>

          {/* Type */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isDeposit"
              checked={isDeposit}
              onChange={e => setIsDeposit(e.target.checked)}
              className="w-3.5 h-3.5 accent-fg-dark"
            />
            <label htmlFor="isDeposit" className="text-xs font-light text-fg-muted cursor-pointer">
              This is a deposit
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400/70 font-light">{error}</p>}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {entry && onDelete ? (
              <button
                onClick={() => { onDelete(entry.id); onClose() }}
                className="text-xs font-light tracking-wide uppercase text-red-400/60 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            ) : <div />}
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const [projects, setProjects]   = useState<Project[]>([])
  const [revenue, setRevenue]     = useState<WeeklyRevenue[]>([])
  const [year, setYear]           = useState(() => new Date().getFullYear())
  const [month, setMonth]         = useState(() => new Date().getMonth())
  const [modal, setModal]         = useState<{
    open: boolean
    entry?: WeeklyRevenue
    projectId?: string
    weekEnding?: string
  }>({ open: false })

  // GP% by Division
  const [overallFormationGP, setOverallFormationGP] = useState<number | null>(null)
  const [formationEstimateCount, setFormationEstimateCount] = useState(0)
  const [designGP, setDesignGP] = useState<number | null>(null)
  const [acceptedProposalCount, setAcceptedProposalCount] = useState(0)
  const [lumeGP, setLumeGP] = useState<number | null>(null)
  const [lumeJobCount, setLumeJobCount] = useState(0)

  type ProjectGPEntry = {
    projectId: string
    projectName: string
    entity: string
    stage?: string
    cost: number
    revenue: number
    gp: number
    reviewReason?: string
  }
  const [projectGPData, setProjectGPData] = useState<ProjectGPEntry[]>([])
  const [belowTargetJobs, setBelowTargetJobs] = useState<ProjectGPEntry[]>([])

  useEffect(() => {
    setProjects(loadProjects())
    setRevenue(loadWeeklyRevenue())

    const allEstimates = loadEstimates()
    const allProposals = loadProposals()

    // Formation GP% from accepted estimates
    const formationEstimates = allEstimates.filter(e => e.status === 'accepted')
    const fmCost = formationEstimates.reduce((s, e) => s + e.lineItems.reduce((ls, li) => ls + li.total, 0), 0)
    const fmRevenue = formationEstimates.reduce((s, e) => s + e.lineItems.reduce((ls, li) => ls + li.revenue, 0), 0)
    const calcFormationGP = fmRevenue > 0 ? ((fmRevenue - fmCost) / fmRevenue) * 100 : null

    // Design GP% from accepted proposals
    // Design is fee-based with minimal tracked costs — use industry-standard 70% GP for design services
    const acceptedProposals = allProposals.filter(p => p.status === 'accepted')
    const designRevenue = acceptedProposals.reduce((s, p) => s + p.phase1Fee + p.phase2Fee + (p.phase3Fee || 0), 0)
    const DESIGN_DEFAULT_GP = 70 // Industry standard for design fee services
    const calcDesignGP = designRevenue > 0 ? DESIGN_DEFAULT_GP : null

    // Lume GP% — try to get from Supabase lume_quotes if available, else use 28.6% default
    const allLoadedProjects = loadProjects()
    const lumeProjects = allLoadedProjects.filter(p => p.entity === 'lume' && p.status === 'active')
    // Attempt to read _gpPercent stored on accepted lume quotes in localStorage
    let calcLumeGP: number | null = null
    if (lumeProjects.length > 0) {
      try {
        const lumeQuotes = JSON.parse(localStorage.getItem('lume_quotes') || '[]') as any[]
        const ACTIVE_LUME = ['accepted','deposit','excavation','steel_fixing','pre_plumb','spray','tiling','equipment','handover']
        const activeWithGP = lumeQuotes.filter((q: any) => ACTIVE_LUME.includes(q.header?.status) && (q.header?._gpPercent ?? 0) > 0)
        if (activeWithGP.length > 0) {
          calcLumeGP = activeWithGP.reduce((s: number, q: any) => s + (q.header._gpPercent || 0), 0) / activeWithGP.length
        } else {
          calcLumeGP = LUME_DEFAULT_GP
        }
      } catch {
        calcLumeGP = LUME_DEFAULT_GP
      }
    }

    setOverallFormationGP(calcFormationGP)
    setFormationEstimateCount(formationEstimates.length)
    setDesignGP(calcDesignGP)
    setAcceptedProposalCount(acceptedProposals.length)
    setLumeGP(calcLumeGP)
    setLumeJobCount(lumeProjects.length)

    // GP% by Project
    // Stages where review is relevant: pre_start, active
    const REVIEW_STAGES = ['pre_start', 'active']
    const projectGPMap: Record<string, { projectName: string; entity: string; stage?: string; cost: number; revenue: number }> = {}
    allEstimates
      .filter(e => e.status === 'accepted' && e.projectId)
      .forEach(e => {
        const proj = allLoadedProjects.find(p => p.id === e.projectId)
        if (!proj) return
        if (!projectGPMap[e.projectId]) {
          projectGPMap[e.projectId] = { projectName: proj.name, entity: proj.entity, stage: proj.stage, cost: 0, revenue: 0 }
        }
        projectGPMap[e.projectId].cost += e.lineItems.reduce((s, li) => s + li.total, 0)
        projectGPMap[e.projectId].revenue += e.lineItems.reduce((s, li) => s + li.revenue, 0)
      })

    const calcProjectGPData = Object.entries(projectGPMap)
      .map(([projectId, data]) => {
        const hasValidData = data.revenue > 0 && data.cost > 0
        const gp = hasValidData ? ((data.revenue - data.cost) / data.revenue) * 100 : 0
        const variance = gp - 40
        const isReviewStage = !data.stage || REVIEW_STAGES.includes(data.stage)

        let reviewReason: string | undefined
        if (!hasValidData) {
          // Only flag missing data on active jobs
          if (isReviewStage && data.stage === 'active') {
            reviewReason = 'Review Required – Missing financial data'
          }
        } else if (isReviewStage && gp < 40) {
          // Only flag underperformance — positive variance is never flagged
          reviewReason = variance <= -5
            ? 'Review Required – GP below target'
            : 'Review Required – Approaching target'
        }

        return { projectId, ...data, gp, reviewReason }
      })
      .sort((a, b) => a.gp - b.gp)

    setProjectGPData(calcProjectGPData)
    // Only flag as "below target" if data is valid and stage is relevant
    setBelowTargetJobs(calcProjectGPData.filter(p =>
      p.gp < 40 && p.revenue > 0 && p.cost > 0 && (!p.stage || REVIEW_STAGES.includes(p.stage))
    ))
  }, [])

  const refresh = () => setRevenue(loadWeeklyRevenue())
  const handleSave = (entry: WeeklyRevenue) => { saveWeeklyRevenue(entry); refresh() }
  const handleDelete = (id: string) => { deleteWeeklyRevenue(id); refresh() }

  const now = new Date()
  const fyLabel = getFinancialYear(now)

  const fridays = getFridaysInMonth(year, month)
  const calendarProjects = projects.filter(proj =>
    revenue.some(r => r.projectId === proj.id && r.plannedRevenue > 0)
  )
  const colTotals = fridays.map(friday =>
    revenue.filter(r => isSameWeek(r.weekEnding, friday)).reduce((s, r) => s + r.plannedRevenue, 0)
  )
  const monthTotal = colTotals.reduce((s, v) => s + v, 0)

  const revenueThisYear = revenue
    .filter(r => getFinancialYear(new Date(r.weekEnding)) === fyLabel)
    .reduce((s, r) => s + r.plannedRevenue, 0)

  const topProjects = Object.entries(
    revenue
      .filter(r => {
        const d = new Date(r.weekEnding)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce<Record<string, { name: string; entity: EntityType; total: number }>>((acc, r) => {
        if (!acc[r.projectId]) acc[r.projectId] = { name: r.projectName, entity: r.entity, total: 0 }
        acc[r.projectId].total += r.plannedRevenue
        return acc
      }, {})
  ).sort((a, b) => b[1].total - a[1].total).slice(0, 3)

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
  }

  // ── Quarter panels (FY: Jul–Jun) ──
  const fyStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  const quarterDefs = [
    { label: 'Q1', months: [6, 7, 8],   years: [fyStart, fyStart, fyStart] },
    { label: 'Q2', months: [9, 10, 11], years: [fyStart, fyStart, fyStart] },
    { label: 'Q3', months: [0, 1, 2],   years: [fyStart + 1, fyStart + 1, fyStart + 1] },
    { label: 'Q4', months: [3, 4, 5],   years: [fyStart + 1, fyStart + 1, fyStart + 1] },
  ]
  const quarterTotals = quarterDefs.map(q =>
    q.months.reduce((sum, m, i) =>
      sum + revenue.filter(r => {
        const d = new Date(r.weekEnding)
        return d.getMonth() === m && d.getFullYear() === q.years[i]
      }).reduce((s, r) => s + r.plannedRevenue, 0)
    , 0)
  )
  const currentQIdx = quarterDefs.findIndex(q =>
    q.months.some((m, i) => m === now.getMonth() && q.years[i] === now.getFullYear())
  )

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
        <span className="text-sm font-light tracking-architectural uppercase text-fg-muted">{fyLabel}</span>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="p-1.5 text-fg-muted hover:text-fg-heading transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-light tracking-wide text-fg-heading uppercase min-w-[128px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1.5 text-fg-muted hover:text-fg-heading transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="flex items-center gap-2 px-4 py-1.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Entry
        </button>
      </div>

      {/* GP% by Division */}
      <div className="mb-10">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-6">Gross Profit % by Division <span className="normal-case font-light text-fg-muted/60">(Ex GST)</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-fg-border mb-2">
          {[
            { label: 'Overall (Formation)', gp: overallFormationGP, sub: belowTargetJobs.length >= 2 ? `⚠ ${belowTargetJobs.length} jobs need review` : `From ${formationEstimateCount} estimates` },
            { label: 'Design',              gp: designGP,           sub: `${acceptedProposalCount} accepted proposals` },
            { label: 'Lume Pools',          gp: lumeGP,             sub: `${lumeJobCount} pool jobs` },
            { label: 'GP% Target',          gp: 40,                 sub: 'Business target', isTarget: true },
          ].map(({ label, gp, sub, isTarget }) => {
            const variance = gp !== null ? gp - 40 : null
            return (
              <div key={label} className="bg-fg-bg px-5 py-5">
                <p className="text-2xs tracking-architectural uppercase text-fg-muted mb-2">{label}</p>
                <p className={`text-2xl font-light tabular-nums ${isTarget ? 'text-fg-heading' : gpColor(gp)}`}>
                  {gp !== null ? `${gp.toFixed(1)}%` : '0.0%'}
                </p>
                <p className="text-2xs text-fg-muted mt-1">{sub}</p>
                <div className="mt-2 h-1 bg-fg-border rounded-full overflow-hidden">
                  <div className={`h-full ${isTarget ? 'bg-fg-dark' : gpBarColor(gp)}`} style={{ width: `${Math.min(100, gp || 0)}%` }} />
                </div>
                {!isTarget && variance !== null && (
                  <div className="mt-2 flex items-center gap-1">
                    <span className={`text-2xs font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {variance >= 0 ? '+' : ''}{variance.toFixed(1)}%
                    </span>
                    <span className="text-2xs text-fg-muted">vs 40% target</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-2xs text-fg-muted/60">
          Design GP% estimated at 72% (fee-based). Lume GP% estimated at 28.6% (40% markup). Formation GP% from accepted estimates.
        </p>
      </div>

      {/* Underperforming jobs */}
      <div className="mb-8">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">Underperforming Jobs</p>
        {belowTargetJobs.length === 0 ? (
          <div className="border border-fg-border px-5 py-4">
            <p className="text-xs font-light text-emerald-600">&#10003; No active jobs currently below GP target</p>
          </div>
        ) : (
          <div className="border border-amber-300/60 bg-amber-50/20">
            <div className="px-5 py-3 border-b border-amber-300/40 flex items-center justify-between">
              <p className="text-2xs font-medium tracking-architectural uppercase text-amber-700">
                &#9888; {belowTargetJobs.length} job{belowTargetJobs.length !== 1 ? 's' : ''} below 40% target
              </p>
              <span className="text-2xs text-fg-muted">Top 3 shown</span>
            </div>
            {belowTargetJobs.slice(0, 3).map(j => {
              const variance = j.gp - 40
              return (
                <div key={j.projectId} className="flex items-center justify-between px-5 py-3 border-b border-amber-300/20 last:border-0">
                  <div>
                    <p className="text-xs font-light text-fg-heading">{j.projectName}</p>
                    {j.reviewReason && <span className="text-2xs text-amber-600 font-medium">{j.reviewReason}</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-light tabular-nums ${gpColor(j.gp)}`}>{j.gp.toFixed(1)}%</span>
                    <span className="text-2xs text-red-500 tabular-nums w-20 text-right">{variance.toFixed(1)}% vs target</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* GP% by Project */}
      <div className="mb-8">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">GP% by Project <span className="normal-case font-light text-fg-muted/60">(Ex GST · from accepted estimates)</span></p>
        <div className="border border-fg-border divide-y divide-fg-border">
          <div className="grid grid-cols-6 px-4 py-2 bg-fg-card/30">
            <span className="text-2xs text-fg-muted uppercase tracking-wide col-span-2">Project</span>
            <span className="text-2xs text-fg-muted uppercase tracking-wide text-right">Revenue</span>
            <span className="text-2xs text-fg-muted uppercase tracking-wide text-right">Cost</span>
            <span className="text-2xs text-fg-muted uppercase tracking-wide text-right">GP%</span>
            <span className="text-2xs text-fg-muted uppercase tracking-wide text-right">vs Target</span>
          </div>
          {projectGPData.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs font-light text-fg-muted">No accepted estimates yet — 0 projects to display</div>
          ) : projectGPData.map(p => {
            const variance = p.gp - 40
            return (
              <div key={p.projectId} className="grid grid-cols-6 px-4 py-3 hover:bg-fg-card/20 transition-colors">
                <div className="col-span-2">
                  <p className="text-xs font-light text-fg-heading">{p.projectName}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xs text-fg-muted">{p.entity}</p>
                    {p.reviewReason
                      ? <span className="text-2xs text-amber-600 font-medium">&#183; {p.reviewReason.replace('Review Required – ', '')}</span>
                      : p.gp >= 40 && p.revenue > 0 && <span className="text-2xs text-green-600">&#183; Above target</span>
                    }
                  </div>
                </div>
                <p className="text-xs font-light tabular-nums text-right text-fg-heading self-center">{formatCurrency(p.revenue)}</p>
                <p className="text-xs font-light tabular-nums text-right text-fg-muted self-center">{formatCurrency(p.cost)}</p>
                <p className={`text-sm font-light tabular-nums text-right self-center ${gpColor(p.gp)}`}>{p.gp.toFixed(1)}%</p>
                <p className={`text-2xs tabular-nums text-right self-center font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {variance >= 0 ? '+' : ''}{variance.toFixed(1)}%
                </p>
              </div>
            )
          })}
        </div>
      </div>

            {/* Revenue Calendar */}
      <div className="space-y-10">
        {quarterDefs.map((q, qi) => {
          const qTotal = quarterTotals[qi]
          const qActual = q.months.reduce((sum, m, mi) => {
            const y = q.years[mi]
            return sum + revenue.filter(r => { const d = new Date(r.weekEnding); return d.getMonth() === m && d.getFullYear() === y }).reduce((s, r) => s + (r.actualInvoiced || 0), 0)
          }, 0)
          const prevQTotal = qi > 0 ? quarterTotals[qi - 1] : null
          const vsQPct = prevQTotal && prevQTotal > 0 ? ((qTotal - prevQTotal) / prevQTotal) * 100 : null
          const isCurrent = qi === currentQIdx

          return (
            <div key={q.label}>
              {/* Quarter divider */}
              <div className="flex items-center gap-3 mb-4">
                <span className={`text-2xs font-semibold tracking-architectural uppercase px-2.5 py-1 ${isCurrent ? 'bg-fg-dark text-white/80' : 'bg-fg-border/60 text-fg-muted'}`}>
                  {q.label}
                </span>
                <span className="text-2xs text-fg-muted uppercase tracking-wide">
                  {MONTH_NAMES[q.months[0]]} – {MONTH_NAMES[q.months[2]]} {q.years[0]}
                </span>
                <div className="flex-1 h-px bg-fg-border/40" />
                <span className="text-xs font-light tabular-nums text-fg-muted">{qTotal > 0 ? formatCurrency(qTotal) : '—'}</span>
              </div>

              {/* Quarter row: monthly blocks + summary */}
              <div className="flex gap-5 items-start">

                {/* Monthly blocks stacked */}
                <div className="flex-1 space-y-4 min-w-0">
                  {q.months.map((m, mi) => {
                    const y = q.years[mi]
                    const mFridays = getFridaysInMonth(y, m)
                    const mRevenue = revenue.filter(r => { const d = new Date(r.weekEnding); return d.getMonth() === m && d.getFullYear() === y })
                    const mProjects = projects.filter(proj => mRevenue.some(r => r.projectId === proj.id && r.plannedRevenue > 0))
                    const mColTotals = mFridays.map(fri => mRevenue.filter(r => isSameWeek(r.weekEnding, fri)).reduce((s, r) => s + r.plannedRevenue, 0))
                    const mActualTotals = mFridays.map(fri => mRevenue.filter(r => isSameWeek(r.weekEnding, fri)).reduce((s, r) => s + (r.actualInvoiced || 0), 0))
                    const mTotal = mColTotals.reduce((s, v) => s + v, 0)
                    const mActual = mActualTotals.reduce((s, v) => s + v, 0)
                    const isThisMonth = m === now.getMonth() && y === now.getFullYear()
                    const midpointPassed = isThisMonth && now.getDate() > 14
                    const atRisk = isThisMonth && midpointPassed && mTotal > 0 && mActual < mTotal * 0.4

                    return (
                      <div key={`${y}-${m}`} className={`border ${isThisMonth ? 'border-fg-heading/40' : 'border-fg-border'}`}>

                        {/* Month header — always same height */}
                        <div className={`flex items-center justify-between px-4 h-10 border-b border-fg-border ${isThisMonth ? 'bg-fg-dark/5' : 'bg-fg-card/30'}`}>
                          <div className="flex items-center gap-2.5">
                            <span className={`text-xs font-semibold tracking-wide uppercase ${isThisMonth ? 'text-fg-heading' : 'text-fg-muted'}`}>
                              {MONTH_NAMES[m]} {y}
                            </span>
                            {atRisk && (
                              <span className="text-2xs font-medium text-amber-600 border border-amber-300/60 px-1.5 py-0.5 leading-none">
                                at risk
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            {mActual > 0 && (
                              <span className="text-2xs text-green-600 tabular-nums">
                                {formatCurrency(mActual)} invoiced
                              </span>
                            )}
                            <span className={`text-xs font-semibold tabular-nums ${mTotal > 0 ? 'text-fg-heading' : 'text-fg-muted/40'}`}>
                              {mTotal > 0 ? formatCurrency(mTotal) : '—'}
                            </span>
                          </div>
                        </div>

                        {mProjects.length === 0 ? (
                          <div className="px-4 h-10 flex items-center">
                            <span className="text-2xs text-fg-muted/50">No revenue entries this month</span>
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse table-fixed">
                            <colgroup>
                              <col className="w-[180px]" />
                              {mFridays.map((_, fi) => <col key={fi} />)}
                              <col className="w-[100px]" />
                            </colgroup>
                            {/* Column headers */}
                            <thead>
                              <tr className="border-b border-fg-border/30 bg-fg-card/10">
                                <th className="py-2 px-4 text-2xs font-light text-fg-muted text-left">Project</th>
                                {mFridays.map((fri, fi) => (
                                  <th key={fi} className={`py-2 px-2 text-2xs font-light text-right whitespace-nowrap ${isCurrentWeek(fri) ? 'text-fg-heading font-medium' : 'text-fg-muted/60'}`}>
                                    {formatDayMonth(fri)}
                                  </th>
                                ))}
                                <th className="py-2 px-4 text-2xs font-light text-fg-muted text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {/* Project rows */}
                              {mProjects.map(proj => {
                                const rowEntries = mRevenue.filter(r => r.projectId === proj.id)
                                const rowTotal = rowEntries.reduce((s, r) => s + r.plannedRevenue, 0)
                                return (
                                  <tr key={proj.id} className="h-10 border-b border-fg-border/20 group hover:bg-fg-card/20 transition-colors">
                                    <td className="py-0 px-4">
                                      <span className="text-xs font-light text-fg-heading truncate block">{proj.name}</span>
                                    </td>
                                    {mFridays.map((fri, fi) => {
                                      const entry = rowEntries.find(r => isSameWeek(r.weekEnding, fri))
                                      const past = isPastWeek(fri)
                                      const curr = isCurrentWeek(fri)
                                      const slipped = entry && past && entry.plannedRevenue > 0 && (entry.actualInvoiced || 0) === 0
                                      const invoiced = entry && (entry.actualInvoiced || 0) > 0
                                      return (
                                        <td key={fi} className={`py-0 px-2 text-right ${curr ? 'bg-fg-border/10' : ''}`}>
                                          {entry ? (
                                            <button onClick={() => setModal({ open: true, entry })} className="w-full text-right">
                                              <span className={`text-xs tabular-nums ${
                                                invoiced ? 'text-green-600' :
                                                slipped  ? 'text-amber-500/70' :
                                                past     ? 'text-fg-muted/40' :
                                                           'text-fg-heading'
                                              }`}>
                                                {formatCurrency(entry.plannedRevenue)}
                                              </span>
                                              {invoiced && entry.actualInvoiced !== entry.plannedRevenue && (
                                                <span className="block text-2xs text-green-600/70 tabular-nums">
                                                  {formatCurrency(entry.actualInvoiced || 0)} actual
                                                </span>
                                              )}
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => setModal({ open: true, projectId: proj.id, weekEnding: toISODate(fri) })}
                                              className="opacity-0 group-hover:opacity-40 text-fg-muted transition-all text-sm leading-none"
                                            >+</button>
                                          )}
                                        </td>
                                      )
                                    })}
                                    <td className="py-0 px-4 text-right">
                                      <span className={`text-xs font-light tabular-nums ${rowTotal > 0 ? 'text-fg-heading' : 'text-fg-muted/30'}`}>
                                        {rowTotal > 0 ? formatCurrency(rowTotal) : '—'}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                              {/* Total row */}
                              <tr className="h-10 border-t border-fg-border bg-fg-card/25">
                                <td className="py-0 px-4">
                                  <span className="text-2xs font-semibold tracking-architectural uppercase text-fg-muted">Total</span>
                                </td>
                                {mColTotals.map((t, ci) => (
                                  <td key={ci} className={`py-0 px-2 text-right ${isCurrentWeek(mFridays[ci]) ? 'bg-fg-border/10' : ''}`}>
                                    <span className={`text-xs font-semibold tabular-nums ${t > 0 ? 'text-fg-heading' : 'text-fg-muted/20'}`}>
                                      {t > 0 ? formatCurrency(t) : '—'}
                                    </span>
                                  </td>
                                ))}
                                <td className="py-0 px-4 text-right">
                                  <span className="text-sm font-semibold text-fg-heading tabular-nums">{formatCurrency(mTotal)}</span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Quarter summary panel — fixed width, consistent layout */}
                <div className={`w-48 shrink-0 border p-5 ${isCurrent ? 'border-fg-heading/30 bg-fg-card/30' : 'border-fg-border'}`}>
                  <p className={`text-2xs font-semibold tracking-architectural uppercase mb-1 ${isCurrent ? 'text-fg-heading' : 'text-fg-muted'}`}>
                    {q.label}
                  </p>
                  {isCurrent && <p className="text-2xs font-light text-fg-muted mb-4">Current quarter</p>}
                  {!isCurrent && <div className="mb-4" />}

                  <div className="space-y-4">
                    <div>
                      <p className="text-2xs text-fg-muted mb-1">Planned</p>
                      <p className={`text-base font-light tabular-nums ${qTotal > 0 ? 'text-fg-heading' : 'text-fg-muted/40'}`}>
                        {qTotal > 0 ? formatCurrency(qTotal) : '—'}
                      </p>
                    </div>
                    {qActual > 0 && (
                      <div>
                        <p className="text-2xs text-fg-muted mb-1">Invoiced</p>
                        <p className="text-base font-light tabular-nums text-green-600">{formatCurrency(qActual)}</p>
                        <div className="mt-1.5 h-1 bg-fg-border/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, qTotal > 0 ? (qActual / qTotal) * 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {vsQPct !== null && (
                      <div>
                        <p className="text-2xs text-fg-muted mb-1">vs Previous</p>
                        <p className={`text-sm font-light tabular-nums ${vsQPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {vsQPct >= 0 ? '▲' : '▼'} {Math.abs(vsQPct).toFixed(0)}%
                        </p>
                      </div>
                    )}
                    {qTotal === 0 && (
                      <p className="text-2xs text-fg-muted/50">No entries yet</p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )
        })}

        {/* FY total */}
        <div className="flex justify-end pt-4 border-t border-fg-border">
          <div className="w-48 text-right">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{fyLabel} Total</p>
            <p className="text-xl font-light text-fg-heading tabular-nums">{formatCurrency(revenueThisYear)}</p>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal.open && (
        <EntryModal
          projects={projects}
          initialProjectId={modal.projectId}
          initialWeekEnding={modal.weekEnding}
          entry={modal.entry}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}