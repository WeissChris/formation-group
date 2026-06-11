'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { loadProjects, loadWeeklyRevenue, loadDesignProjects, loadProgressPaymentStages, loadProgressClaims, loadProposals, loadGanttEntries, loadWeeklyActuals, loadEstimates, loadEstimatesByProject } from '@/lib/storage'
import { useCrossTabRefresh } from '@/lib/useCrossTabRefresh'
import { seedDemoData } from '@/lib/seed'
import { formatCurrency, getFinancialYear, MONTH_NAMES } from '@/lib/utils'
import type { Project, WeeklyRevenue, GanttEntry, WeeklyActual } from '@/types'
import { isSupabaseConfigured } from '@/lib/supabase'
import { calcProjectHealth, scheduleStatus } from '@/lib/projectHealth'
import { getLiveJobs, triggerXeroSync, triggerManualSnapshot, type LiveJobRow as LiveJobApiRow } from '@/lib/xero'
import { computeLiveJobRow, computePortfolioTotals, type LiveJobRow } from '@/lib/liveJobs'
import { LiveJobsTable } from '@/components/LiveJobsTable'

function toTitleCase(str: string): string {
  return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
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

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [revenue, setRevenue] = useState<WeeklyRevenue[]>([])
  const [loaded, setLoaded] = useState(false)
  const [allDesignProjects, setAllDesignProjects] = useState<ReturnType<typeof loadDesignProjects>>([])
  const [allActuals, setAllActuals] = useState<WeeklyActual[]>([])
  const [allGantt, setAllGantt] = useState<GanttEntry[]>([])
  // Estimates loaded once on mount and held in state. Previously the per-project forecastGP
  // fallback called loadEstimates() inside .map(), re-parsing the entire estimates blob from
  // localStorage for every project on every render — measurable jank on dashboards with N>10.
  const [allEstimates, setAllEstimates] = useState<ReturnType<typeof loadEstimates>>([])
  // Server-derived per-project cost data (from Xero via /api/xero/live-jobs).
  // Indexed by projectId for the join. `configured` flag drives the empty state.
  const [liveJobCosts, setLiveJobCosts] = useState<Map<string, LiveJobApiRow>>(new Map())
  const [liveJobsConfigured, setLiveJobsConfigured] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [snapshotting, setSnapshotting] = useState(false)

  // Auto-capture a daily fade snapshot. The dashboard is the only place that can compute the
  // Live Jobs rows (progress claims are localStorage-only), and snapshots had never been captured
  // (the manual button was never clicked), so the fade-over-time history was empty. This fires
  // once per day, best-effort, only when there's real Xero cost data — the server dedups by
  // (project, date). A ref holds the latest rows so the effect stays unconditional + early-return
  // safe regardless of the render flow below.
  const liveJobRowsRef = useRef<LiveJobRow[]>([])
  const autoSnapDone = useRef(false)
  useEffect(() => {
    if (autoSnapDone.current) return
    const rows = liveJobRowsRef.current
    if (rows.length === 0 || !rows.some(r => r.hasLiveCostData)) return
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem('fg_last_auto_snapshot') === today) { autoSnapDone.current = true; return }
    autoSnapDone.current = true
    localStorage.setItem('fg_last_auto_snapshot', today)
    void triggerManualSnapshot(rows.map(row => ({ row, costByAccount: {} })))
  })

  // Hoisted into a callable so we can re-run from the cross-tab refresh handler below
  const reload = () => {
    const projs = loadProjects()
    setProjects(projs)
    setRevenue(loadWeeklyRevenue())
    setAllDesignProjects(loadDesignProjects())
    setAllEstimates(loadEstimates())
    const activeFormation = projs.filter(p => p.status === 'active' && p.entity === 'formation')
    setAllActuals(activeFormation.flatMap(p => loadWeeklyActuals(p.id)))
    setAllGantt(activeFormation.flatMap(p => loadGanttEntries(p.id)))
    setLoaded(true)
  }

  // Fetch the server-side live-job cost data. Separate from `reload` because it's a network
  // call and doesn't share triggers with localStorage refreshes.
  const reloadLiveJobs = async () => {
    const { items, configured } = await getLiveJobs()
    setLiveJobsConfigured(configured)
    const map = new Map<string, LiveJobApiRow>()
    for (const it of items) map.set(it.project_id, it)
    setLiveJobCosts(map)
  }

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const result = await triggerXeroSync()
      await reloadLiveJobs()
      if (!result.ok && result.error) window.alert(`Sync failed: ${result.error}`)
    } finally {
      setSyncing(false)
    }
  }

  // Freeze the current Live Jobs view into snapshot history. Browser computes the rows
  // (because progress claims are localStorage-only) and POSTs them to the server.
  const handleSnapshotNow = async () => {
    if (liveJobRows.length === 0) {
      window.alert('No active projects to snapshot.')
      return
    }
    if (!window.confirm(`Snapshot ${liveJobRows.length} active project${liveJobRows.length === 1 ? '' : 's'} for today?`)) return
    setSnapshotting(true)
    try {
      // Build the per-account cost map for each project so the snapshot freezes the breakdown
      // (not just the totals). Future fade-tracking will read this back.
      const inputs = liveJobRows.map(row => {
        const apiRow = liveJobCosts.get(row.projectId)
        const costByAccount: Record<string, number> = {}
        // The current /api/xero/live-jobs response doesn't include per-account detail — only the
        // totals. We pass an empty map here as a starting point. A future enhancement could call
        // /api/projects/:id/costs per project to get the full breakdown into the snapshot JSONB.
        return { row, costByAccount }
      })
      const result = await triggerManualSnapshot(inputs)
      if (result.ok) {
        const skipped = result.skipped_duplicate
        window.alert(
          `Snapshot saved for ${result.snapshot_date}.\n` +
          `${result.snapshotted} written` +
          (skipped > 0 ? ` · ${skipped} skipped (already snapshotted today)` : ''),
        )
      } else {
        window.alert(`Snapshot failed: ${result.error ?? 'unknown error'}`)
      }
    } finally {
      setSnapshotting(false)
    }
  }

  useEffect(() => {
    reload()
    reloadLiveJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If another tab saves a project/estimate/revenue, refresh this dashboard's view too.
  useCrossTabRefresh(
    ['projects', 'estimates', 'revenue', 'proposals', 'gantt', 'actuals', 'all'],
    () => reload(),
  )

  const now = new Date()
  const activeProjects = projects.filter(p => p.status === 'active')
  const formationProjects = activeProjects.filter(p => p.entity === 'formation')
  const lumeProjects     = activeProjects.filter(p => p.entity === 'lume')
  const activeDesignProjects = allDesignProjects.filter(p =>
    p.phase1Status === 'in_progress' || p.phase2Status === 'in_progress'
  )

  const thisMonth = revenue.filter(r => {
    const d = new Date(r.weekEnding)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const revenueThisMonth = thisMonth.reduce((s, r) => s + r.plannedRevenue, 0)

  // Per-entity revenue this month
  const formationRevenueMonth = thisMonth.filter(r => r.entity === 'formation').reduce((s, r) => s + r.plannedRevenue, 0)
  const lumeRevenueMonth = thisMonth.filter(r => r.entity === 'lume').reduce((s, r) => s + r.plannedRevenue, 0)
  const designRevenueMonth = thisMonth.filter(r => r.entity === 'design').reduce((s, r) => s + r.plannedRevenue, 0)

  // FY revenue per entity
  const designRevenueYTD = revenue.filter(r =>
    r.entity === 'design' &&
    getFinancialYear(new Date(r.weekEnding)) === getFinancialYear(now)
  ).reduce((s, r) => s + r.plannedRevenue, 0)

  const formationRevenueFY = revenue.filter(r =>
    r.entity === 'formation' &&
    getFinancialYear(new Date(r.weekEnding)) === getFinancialYear(now)
  ).reduce((s, r) => s + r.plannedRevenue, 0)

  const lumeRevenueFY = revenue.filter(r =>
    r.entity === 'lume' &&
    getFinancialYear(new Date(r.weekEnding)) === getFinancialYear(now)
  ).reduce((s, r) => s + r.plannedRevenue, 0)

  const pipeline = revenue
    .filter(r => new Date(r.weekEnding) > now)
    .reduce((s, r) => s + r.plannedRevenue, 0)

  const fyRevenue = revenue
    .filter(r => getFinancialYear(new Date(r.weekEnding)) === getFinancialYear(now))
    .reduce((s, r) => s + r.plannedRevenue, 0)

  // Pipeline per entity (future revenue)
  const designPipeline = revenue.filter(r => r.entity === 'design' && new Date(r.weekEnding) > now).reduce((s, r) => s + r.plannedRevenue, 0)
  const formationPipeline = revenue.filter(r => r.entity === 'formation' && new Date(r.weekEnding) > now).reduce((s, r) => s + r.plannedRevenue, 0)
  // Lume pipeline: from revenue schedule + from accepted lume_quotes in localStorage
  const lumePipelineRevenue = revenue.filter(r => r.entity === 'lume' && new Date(r.weekEnding) > now).reduce((s, r) => s + r.plannedRevenue, 0)
  const lumePipelineQuotes = (() => {
    try {
      const PIPELINE_STATUSES = ['accepted','deposit','excavation','steel_fixing','pre_plumb','spray','tiling','equipment','handover']
      const lumeQuotes = JSON.parse(localStorage.getItem('lume_quotes') || '[]') as any[]
      return lumeQuotes
        .filter((q: any) => PIPELINE_STATUSES.includes(q.header?.status) && !(q.header?.archived))
        .reduce((s: number, q: any) => s + (q.header?._totalIncGst ?? 0), 0)
    } catch { return 0 }
  })()
  const lumePipeline = Math.max(lumePipelineRevenue, lumePipelineQuotes)

  // Business Health band calculations
  const next30Days = revenue.filter(r => {
    const d = new Date(r.weekEnding)
    const diff = (d.getTime() - now.getTime()) / 86400000
    return diff >= 0 && diff <= 30
  }).reduce((s, r) => s + r.plannedRevenue, 0)

  const next90Days = revenue.filter(r => {
    const d = new Date(r.weekEnding)
    const diff = (d.getTime() - now.getTime()) / 86400000
    return diff >= 0 && diff <= 90
  }).reduce((s, r) => s + r.plannedRevenue, 0)

  const securedRevenue = activeProjects.reduce((s, p) => s + (p.contractValue || 0), 0)

  // Per-project GP% for formation projects
  const projectGP = formationProjects.map(p => {
    const pActuals = allActuals.filter(a => a.projectId === p.id)
    const pGantt = allGantt.filter(g => g.projectId === p.id)
    const actualCost = pActuals.reduce((s, a) => s + a.supplyCost + a.labourCost, 0)
    const budgetCost = pGantt.reduce((s, g) => {
      const segTotal = g.segments.reduce((ss, seg) => ss + (seg.costAllocation || 0), 0)
      // Fallback: if segments have no costAllocation, use budgetedCost from the GanttEntry
      return s + (segTotal > 0 ? segTotal : g.budgetedCost)
    }, 0)
    // NB: A "currentGP" used to live here computed as (contractValue - actualCost) / contractValue.
    // That math was structurally wrong — it compares cost-to-date against the full contract, not
    // against what's been invoiced so far. Removed because the value was never rendered anywhere.
    // If a dashboard tile ever wants current GP, base it on totalInvoiced (see Position tab).
    const forecastGP = p.contractValue > 0 && budgetCost > 0
      ? ((p.contractValue - budgetCost) / p.contractValue) * 100
      : (() => {
          // Fallback: use estimate line item totals as budget cost proxy. Read from the
          // hoisted `allEstimates` state — no per-render localStorage parse.
          const projectEstimates = allEstimates.filter(e => e.projectId === p.id)
          const estimateCost = projectEstimates.reduce((s, e) =>
            s + (e.lineItems || []).reduce((ls, li) => ls + (li.total || 0), 0), 0)
          return p.contractValue > 0 && estimateCost > 0
            ? ((p.contractValue - estimateCost) / p.contractValue) * 100
            : null
        })()
    return { project: p, forecastGP }
  })

  const projectGPWithForecast = projectGP.filter(p => p.forecastGP !== null)
  const avgForecastGP = projectGPWithForecast.length > 0
    ? projectGPWithForecast.reduce((s, p) => s + (p.forecastGP || 0), 0) / projectGPWithForecast.length
    : null

  const belowTargetProjects = projectGP.filter(p => p.forecastGP !== null && (p.forecastGP || 0) < 40)

  // Upcoming revenue grouped by month
  const upcoming = revenue
    .filter(r => new Date(r.weekEnding) >= now)
    .sort((a, b) => new Date(a.weekEnding).getTime() - new Date(b.weekEnding).getTime())

  const upcomingByMonth = upcoming.reduce((acc, r) => {
    const d = new Date(r.weekEnding)
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
    if (!acc[key]) acc[key] = { total: 0, jobs: new Set<string>() }
    acc[key].total += r.plannedRevenue
    acc[key].jobs.add(r.projectId)
    return acc
  }, {} as Record<string, { total: number; jobs: Set<string> }>)

  // Fill in any gap months in the next 3 months
  const upcomingMonths = Object.entries(upcomingByMonth).slice(0, 6)
  const maxMonthTotal = Math.max(...upcomingMonths.map(([, v]) => v.total), 1)

  // Check for gap months in next 90 days
  const gapMonths: string[] = []
  for (let i = 0; i < 3; i++) {
    const checkDate = new Date(now)
    checkDate.setMonth(checkDate.getMonth() + i)
    const key = `${MONTH_NAMES[checkDate.getMonth()]} ${checkDate.getFullYear()}`
    if (!upcomingByMonth[key] || upcomingByMonth[key].total === 0) {
      gapMonths.push(key)
    }
  }

  // Outstanding invoices — union of both invoicing models so the KPI reflects whichever model the project uses.
  // Stage-based projects write to fg_payment_stages via the schedule UI; progress-claim projects write to
  // fg_progress_claims via the Operations tab. A project uses one model or the other, not both.
  const allStages = projects.flatMap(p => loadProgressPaymentStages(p.id))
  const invoicedUnpaidStages = allStages.filter(s => s.status === 'invoiced' && (s.paidToDate ?? 0) === 0)
  const stagesOutstanding = invoicedUnpaidStages.reduce((sum, s) => sum + (s.invoicedAmount ?? s.quotedAmount), 0)
  const stageProjectIds = invoicedUnpaidStages.map(s => s.projectId)

  const allClaims = loadProgressClaims()
  // "Sent" claims are issued but not yet paid; "paid" closes the loop. Drafts and pending are not yet billed.
  const outstandingClaims = allClaims.filter(c => c.status === 'sent')
  const claimsOutstanding = outstandingClaims.reduce((sum, c) => sum + c.subtotalEx, 0)
  const claimProjectIds = outstandingClaims.map(c => c.projectId)

  const outstandingInvoicesTotal = stagesOutstanding + claimsOutstanding
  const outstandingInvoicesProjects = new Set([...stageProjectIds, ...claimProjectIds]).size

  // Projects without forecast (active formation projects with no gantt entries)
  const projectsMissingForecast = formationProjects.filter(p => {
    const entries = loadGanttEntries(p.id)
    return entries.length === 0
  }).length

  // Proposals expiring soon (pending, valid until within 14 days)
  const allProposals = loadProposals()
  const soonMs = 14 * 86400000
  const expiringProposals = allProposals.filter(p => {
    if (p.status !== 'pending' && p.status !== 'sent') return false
    if (!p.validUntil) return false
    const expiry = new Date(p.validUntil)
    const diff = expiry.getTime() - now.getTime()
    return diff >= 0 && diff <= soonMs
  })

  const supabaseActive = isSupabaseConfigured()

  // Live Jobs rows — combine local data (project, accepted estimates, progress claims) with
  // server cost data (Xero feed). Only includes status != 'complete' per the design decision.
  const liveJobRows: LiveJobRow[] = activeProjects.map(project => {
    const acceptedEstimates = allEstimates.filter(
      e => e.projectId === project.id && e.status === 'accepted',
    )
    const claims = loadProgressClaims(project.id)
    const apiRow = liveJobCosts.get(project.id) ?? null
    return computeLiveJobRow({
      project,
      acceptedEstimates,
      progressClaims: claims,
      costToDate: apiRow?.mapped ? apiRow.cost_to_date : null,
      forecastFinalCost: apiRow?.mapped ? apiRow.forecast_final_cost : null,
    })
  })
  const liveJobsLastSync = Array.from(liveJobCosts.values())
    .map(r => r.last_pulled_at)
    .filter((d): d is string => d !== null)
    .sort()
    .pop() ?? null
  const liveJobsTotals = computePortfolioTotals(liveJobRows)
  liveJobRowsRef.current = liveJobRows   // feed the auto-snapshot effect (declared above)

  const handleSeedData = () => {
    seedDemoData()
    setProjects(loadProjects())
    setRevenue(loadWeeklyRevenue())
    setAllDesignProjects(loadDesignProjects())
  }

  // Empty state
  if (loaded && projects.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-24">
        <div className="text-center py-16">
          <img
            src="/formation-primary-black.svg"
            alt="Formation"
            className="h-8 w-auto mx-auto mb-10 opacity-20"
          />
          <h2 className="text-lg font-light tracking-wide text-fg-heading mb-3">
            No projects yet
          </h2>
          <p className="text-sm font-light text-fg-muted mb-10 max-w-sm mx-auto leading-relaxed">
            Add your first project to get started, or load demo data to explore the platform.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/projects/new"
              className="px-6 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              Add Project
            </Link>
            <button
              onClick={handleSeedData}
              className="px-6 py-2.5 border border-[#6B6560] text-[#6B6560] text-xs font-light tracking-architectural uppercase hover:border-fg-heading hover:text-fg-heading transition-colors"
            >
              Load demo data
            </button>
          </div>

          {/* Tagline + feature hints */}
          <div className="mt-12">
            <p className="text-sm font-light italic text-[#6B6560] mb-6">
              Track every project. Invoice every week.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-6">
              {[
                { icon: '📊', label: 'Revenue Calendar', desc: 'see your full cash flow forecast' },
                { icon: '📋', label: 'Projects', desc: 'track every job from quote to handover' },
                { icon: '✏️', label: 'Design', desc: 'send proposals and get signatures online' },
              ].map(hint => (
                <div key={hint.label} className="flex items-start gap-2 text-left max-w-[180px]">
                  <span className="text-base leading-none mt-0.5">{hint.icon}</span>
                  <div>
                    <p className="text-xs font-light text-[#6B6560]">{hint.label}</p>
                    <p className="text-2xs font-light text-[#6B6560]/60 leading-relaxed">{hint.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Attention items
  const attentionItems: Array<{ icon: string; title: string; subtitle: string; href: string; severity?: 'red' | 'amber' | 'green' }> = []

  if (outstandingInvoicesTotal > 0) {
    attentionItems.push({
      icon: '💰',
      title: `${formatCurrency(outstandingInvoicesTotal)} invoiced but unpaid`,
      subtitle: `Across ${pluralize(outstandingInvoicesProjects, 'project')}`,
      href: '/projects',
    })
  }

  for (const month of gapMonths) {
    attentionItems.push({
      icon: '⚠',
      title: `Revenue gap in ${month}`,
      subtitle: 'No revenue scheduled for this month',
      href: '/revenue',
    })
  }

  if (projectsMissingForecast > 0) {
    attentionItems.push({
      icon: '📋',
      title: `${pluralize(projectsMissingForecast, 'project')} missing revenue forecast`,
      subtitle: 'Active jobs with no Gantt entries',
      href: '/projects',
    })
  }

  if (lumePipeline === 0 && lumeProjects.length === 0) {
    attentionItems.push({
      icon: '🏊',
      title: 'Lume Pools has no pipeline or active projects',
      subtitle: 'No future revenue scheduled and no active jobs',
      href: '/projects?entity=lume',
    })
  }

  // Revenue cliff: any of the next 3 months with < $50k
  for (let i = 0; i < 3; i++) {
    const checkDate = new Date(now)
    checkDate.setMonth(checkDate.getMonth() + i)
    const key = `${MONTH_NAMES[checkDate.getMonth()]} ${checkDate.getFullYear()}`
    const monthTotal = upcomingByMonth[key]?.total ?? 0
    if (monthTotal > 0 && monthTotal < 50000) {
      attentionItems.push({
        icon: '📉',
        title: `Revenue cliff in ${key}`,
        subtitle: `Only ${formatCurrency(monthTotal)} scheduled — below $50k threshold`,
        href: '/revenue',
      })
    }
  }

  if (expiringProposals.length > 0) {
    attentionItems.push({
      icon: '⏰',
      title: `${pluralize(expiringProposals.length, 'proposal')} expiring within 14 days`,
      subtitle: expiringProposals.map(p => p.clientName).join(', '),
      href: '/design',
    })
  }

  belowTargetProjects.forEach(({ project, forecastGP }) => {
    attentionItems.push({
      icon: '📉',
      title: `${toTitleCase(project.name)} forecast GP below target`,
      subtitle: `${(forecastGP || 0).toFixed(1)}% forecast vs 40% target`,
      href: `/projects/${project.id}`,
      severity: (forecastGP || 0) < 35 ? 'red' : 'amber',
    })
  })

  // Schedule slippage flags — from baseline programme
  projects.filter(p => p.baseline?.plannedCompletion && p.status === 'active').forEach(p => {
    const { status, daysSlippage } = scheduleStatus(p)
    if (status !== 'green' && daysSlippage !== null) {
      attentionItems.push({
        icon: status === 'red' ? '🔴' : '🟡',
        title: p.name,
        subtitle: `${daysSlippage}d behind planned completion (${new Date(p.baseline!.plannedCompletion!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })})`,
        href: `/projects/${p.id}`,
        severity: status,
      })
    }
  })

  // Baseline health flags — cost increase, schedule slippage, revenue behind plan
  const activeProjectsWithBaseline = projects.filter(p => p.baseline && p.status === 'active')
  activeProjectsWithBaseline.forEach(p => {
    const pGantt = allGantt.filter(g => g.projectId === p.id)
    const pActuals = allActuals.filter(a => a.projectId === p.id)
    const pEstimates = loadEstimatesByProject(p.id)
    const health = calcProjectHealth(p, pEstimates, pGantt, pActuals)
    // Only add cost/schedule flags (GP already covered by belowTargetProjects)
    health.flags
      .filter(f => !f.reason.includes('GP below target'))
      .forEach(flag => {
        attentionItems.push({
          icon: flag.status === 'red' ? '🔴' : '🟡',
          title: p.name,
          subtitle: flag.reason.replace('Review Required – ', ''),
          href: `/projects/${p.id}`,
          severity: flag.status === 'red' ? 'red' : 'amber',
        })
      })
  })

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">

      {/* Page header */}
      <div className="mb-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-light tracking-architectural uppercase text-fg-muted mb-1">
              {MONTH_NAMES[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
              {' · '}{getFinancialYear(now)}
            </p>
            <h1 className="text-2xl font-light tracking-wide text-fg-heading">
              {greeting}
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${supabaseActive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-xs font-light text-fg-muted">
              {supabaseActive ? 'Cloud sync active' : 'Local only'}
            </span>
          </div>
        </div>
      </div>

      {/* ── BAND 1: BUSINESS HEALTH ─────────────────────────────────── */}
      <div>
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">
          Business Health
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-fg-border">
          {[
            { label: 'Active Jobs',            subtitle: 'Currently on site or in progress', value: String(activeProjects.length),    href: '/projects' },
            { label: 'Contract Value (Active)', subtitle: 'Total active project contracts',   value: formatCurrency(securedRevenue),   href: '/projects' },
            { label: 'Future Revenue',          subtitle: 'Scheduled but not yet invoiced',   value: formatCurrency(pipeline),         href: '/revenue' },
            { label: 'Next 30 Days',            subtitle: 'Scheduled invoicing',               value: formatCurrency(next30Days),       href: '/revenue' },
            { label: 'Next 90 Days',            subtitle: '3-month outlook',                   value: formatCurrency(next90Days),       href: '/revenue' },
          ].map(stat => (
            <Link key={stat.label} href={stat.href} className="bg-fg-bg px-6 py-7 cursor-pointer hover:bg-fg-card/30 transition-colors block">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">
                {stat.label}
              </p>
              <p className="text-2xs font-light text-fg-muted/60 mb-3">
                {stat.subtitle}
              </p>
              <p className="text-2xl font-light text-fg-heading tabular-nums">
                {stat.value}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div className="border-t border-fg-border my-8" />

      {/* ── BAND 1.5: LIVE JOBS (Xero-fed GP per project) ────────────── */}
      <LiveJobsTable
        rows={liveJobRows}
        totals={liveJobsTotals}
        lastSyncedAt={liveJobsLastSync}
        configured={liveJobsConfigured}
        syncing={syncing}
        onSyncNow={handleSyncNow}
        snapshotting={snapshotting}
        onSnapshotNow={handleSnapshotNow}
      />

      <div className="border-t border-fg-border my-8" />

      {/* ── BAND 2: DIVISION PERFORMANCE ────────────────────────────── */}
      <div>
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">
          Division Performance
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Design */}
          <div className="bg-fg-bg border border-fg-border px-6 py-6">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">
              Design
            </p>
            <div className="space-y-2 mb-5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">Active</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{pluralize(activeDesignProjects.length, 'project')}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">Pipeline</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(designPipeline)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">This Month</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(designRevenueMonth)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">FY Revenue</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(designRevenueYTD)}</span>
              </div>
            </div>
            <Link href="/design" className="text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">
              View Proposals →
            </Link>
          </div>

          {/* Formation */}
          <div className="bg-fg-bg border border-fg-border px-6 py-6">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">
              Formation Landscapes
            </p>
            <div className="space-y-2 mb-5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">Active</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{pluralize(formationProjects.length, 'project')}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">Pipeline</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(formationPipeline)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">This Month</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(formationRevenueMonth)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">FY Revenue</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(formationRevenueFY)}</span>
              </div>
            </div>
            {avgForecastGP !== null && (
              <div className="mt-3 pt-3 border-t border-fg-border/30">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xs tracking-architectural uppercase text-fg-muted">Avg Forecast GP%</span>
                  <span className={`text-sm font-light tabular-nums ${
                    avgForecastGP >= 40 ? 'text-green-600' : avgForecastGP >= 35 ? 'text-amber-500' : 'text-red-500'
                  }`}>{avgForecastGP.toFixed(1)}%</span>
                </div>
                <div className="text-2xs text-fg-muted mt-0.5">Target: 40%</div>
              </div>
            )}
            <Link href="/projects?entity=formation" className="text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors mt-5 block">
              View Projects →
            </Link>
          </div>

          {/* Lume */}
          <div className="bg-fg-bg border border-fg-border px-6 py-6">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">
              Lume Pools
            </p>
            <div className="space-y-2 mb-5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">Active</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{pluralize(lumeProjects.length, 'project')}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">Pipeline</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(lumePipeline)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">This Month</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(lumeRevenueMonth)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-light text-fg-muted">FY Revenue</span>
                <span className="text-xs font-light text-fg-heading tabular-nums">{formatCurrency(lumeRevenueFY)}</span>
              </div>
            </div>
            <Link href="/projects?entity=lume" className="text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">
              View Quotes →
            </Link>
          </div>

        </div>
      </div>

      {/* ── Quarterly GP% ── */}
      <div className="border-t border-fg-border pt-8 mt-8">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-6">
          Gross Profit — Formation Landscapes
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-fg-border px-5 py-4">
            <p className="text-2xs tracking-architectural uppercase text-fg-muted mb-1">Avg Forecast GP%</p>
            <p className={`text-2xl font-light ${avgForecastGP !== null ? (avgForecastGP >= 40 ? 'text-green-600' : 'text-amber-500') : 'text-fg-muted'}`}>
              {avgForecastGP !== null ? `${avgForecastGP.toFixed(1)}%` : '—'}
            </p>
            <p className="text-2xs text-fg-muted mt-1">
              Across {projectGPWithForecast.length} active project{projectGPWithForecast.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="bg-white border border-fg-border px-5 py-4">
            <p className="text-2xs tracking-architectural uppercase text-fg-muted mb-1">Target</p>
            <p className="text-2xl font-light text-fg-heading">40.0%</p>
            <p className="text-2xs text-fg-muted mt-1">
              {belowTargetProjects.length > 0
                ? `${belowTargetProjects.length} job${belowTargetProjects.length === 1 ? '' : 's'} below target`
                : 'All jobs on target ✓'
              }
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-fg-border my-8" />

      {/* ── BAND 3: NEEDS ATTENTION + UPCOMING REVENUE ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* Needs Attention — 60% */}
        <div className="lg:col-span-3">
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-4">
            Needs Attention
          </p>

          {attentionItems.length === 0 ? (
            <div className="py-6">
              <p className="text-sm font-light text-emerald-600">✓ No issues requiring attention</p>
            </div>
          ) : (
            <div className="border-t border-fg-border">
              {attentionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-3 py-3 border-b border-fg-border/30">
                  <span className="text-sm mt-0.5">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-light text-fg-heading">{item.title}</p>
                    <p className="text-2xs text-fg-muted">{item.subtitle}</p>
                  </div>
                  <Link href={item.href} className="ml-auto shrink-0 text-2xs text-fg-muted hover:text-fg-heading uppercase tracking-wide transition-colors">
                    View →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Revenue — 40% */}
        <div className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">
              Upcoming Revenue
            </p>
            <Link href="/revenue" className="text-2xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">
              Full calendar →
            </Link>
          </div>

          {upcomingMonths.length === 0 ? (
            <div className="py-6">
              <p className="text-sm font-light text-fg-muted">No revenue scheduled.</p>
              <Link href="/revenue" className="text-xs font-light tracking-wide text-fg-heading border-b border-fg-border pb-px mt-2 inline-block">
                Add entries
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingMonths.map(([month, data]) => {
                const isGap = data.total === 0
                const barWidth = isGap ? 0 : Math.round((data.total / maxMonthTotal) * 100)
                const barColor = isGap
                  ? 'bg-red-200'
                  : data.total > 100000
                    ? 'bg-fg-dark'
                    : data.total >= 50000
                      ? 'bg-[#8A8580]'
                      : 'bg-amber-400'
                return (
                  <div key={month}>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className={`text-xs font-light ${isGap ? 'text-red-400' : data.total < 50000 ? 'text-amber-500' : 'text-fg-heading'}`}>
                        {month}
                      </span>
                      <div className="flex items-baseline gap-2">
                        {isGap ? (
                          <span className="text-xs font-light text-red-400">$0 — no revenue</span>
                        ) : (
                          <>
                            <span className="text-2xs font-light text-fg-muted">{pluralize(data.jobs.size, 'job')}</span>
                            <span className={`text-xs font-light tabular-nums ${data.total < 50000 ? 'text-amber-500' : 'text-fg-heading'}`}>{formatCurrency(data.total)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-fg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColor} rounded-full`}
                        style={{ width: isGap ? '100%' : `${barWidth}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  )
}
