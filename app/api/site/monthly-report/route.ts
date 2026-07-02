import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom } from '@/lib/siteServer'
import { entrySegments, entryClaimSegments } from '@/lib/ganttForecast'
import { computeScorecard, segmentElapsed, type Scorecard } from '@/lib/siteScorecard'
import { workingDaysBetween } from '@/lib/ganttSchedule'
import { STD_LABOUR_RATE } from '@/lib/estimateCalculations'
import { isLabourAccount } from '@/lib/labour'
import { MonthlyReportPdf, type MonthlyReport, type ProjectReport } from '@/lib/monthlyReportPdf'
import type { Estimate, GanttEntry, SubcontractorPackage } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// One-click monthly management-meeting report: every project the signed-in foreman runs, one
// page each - done last month, planned next month, planned-vs-actual tracking. No profit.

const iso = (d: Date) => {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-AU')

/** Minimal row -> GanttEntry (only the fields the forecast/scorecard readers touch). */
function liteGantt(row: Record<string, unknown>): GanttEntry {
  return {
    id: row.id as string, projectId: row.project_id as string, estimateId: (row.estimate_id as string) || '',
    category: row.category as string, crewType: (row.crew_type as GanttEntry['crewType']) || 'Formation',
    budgetedRevenue: Number(row.budgeted_revenue) || 0, budgetedCost: Number(row.budgeted_cost) || 0,
    segments: (row.segments as GanttEntry['segments']) || [], subtasks: (row.subtasks as GanttEntry['subtasks']) || [],
  }
}

export async function GET(request: NextRequest) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const { data: projRows } = await supabaseAdmin.from('fg_projects').select('*')
    .eq('foreman', session.name).not('status', 'in', '("complete","invoiced")')
  const projects = (projRows ?? []) as Record<string, unknown>[]
  if (projects.length === 0) return NextResponse.json({ ok: false, error: 'no_projects' }, { status: 404 })

  const now = new Date()
  const todayIso = iso(now)
  const doneFrom = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))   // 1st of last month
  const planTo = iso(new Date(now.getTime() + 31 * 86400000))

  const reports: ProjectReport[] = []
  for (const p of projects) {
    const pid = p.id as string
    const siteId = p.safety_site_id as string | null
    const [ganttRes, estRes, hoursRes, costsRes, baseRes, tbRes, incRes, indRes] = await Promise.all([
      supabaseAdmin.from('fg_gantt').select('*').eq('project_id', pid),
      supabaseAdmin.from('fg_estimates').select('*').eq('project_id', pid),
      supabaseAdmin.from('fg_xero_project_hours').select('week_ending, hours').eq('project_id', pid),
      supabaseAdmin.from('fg_xero_project_costs').select('account_name, amount_ex_gst').eq('project_id', pid),
      supabaseAdmin.from('fg_gantt_baselines').select('baselines').eq('project_id', pid).maybeSingle(),
      supabaseAdmin.from('sf_toolbox_meetings').select('id', { count: 'exact', head: true }).eq('project_id', pid).gte('held_at', `${doneFrom}T00:00:00Z`),
      supabaseAdmin.from('sf_incidents').select('id', { count: 'exact', head: true }).eq('project_id', pid).gte('occurred_at', `${doneFrom}T00:00:00Z`),
      siteId
        ? supabaseAdmin.from('sf_inductions').select('id', { count: 'exact', head: true }).eq('site_id', siteId)
        : Promise.resolve({ count: 0 } as { count: number | null }),
    ])

    const gantt = (ganttRes.data ?? []).map(liteGantt)
    const allEst = (estRes.data ?? []) as Record<string, unknown>[]
    const bases = allEst.filter(e => !e.parent_estimate_id)
    const accepted = bases.filter(e => e.status === 'accepted')
    const baseRow = [...(accepted.length ? accepted : bases)].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
    const estimate = baseRow ? ({ lineItems: (baseRow.line_items as Estimate['lineItems']) || [] } as unknown as Estimate) : null

    // Subbie committed = the project's packages (approved + variations) - lite cast for the scorecard.
    const { data: pkgRows } = await supabaseAdmin.from('fg_subcontractors')
      .select('approved_value, variations').eq('project_id', pid)
    const subbies = (pkgRows ?? []).map(r => ({
      approvedValue: Number(r.approved_value) || 0, variations: Number(r.variations) || 0,
    })) as unknown as SubcontractorPackage[]

    const hoursRows = (hoursRes.data ?? []).map(r => ({ week: r.week_ending as string, hours: Number(r.hours) || 0 }))
    const totalHours = hoursRows.reduce((s, r) => s + r.hours, 0)
    const supplyCost = (costsRes.data ?? [])
      .filter(r => !isLabourAccount((r.account_name as string) || '') && !/subcontract/i.test((r.account_name as string) || ''))
      .reduce((s, r) => s + (Number(r.amount_ex_gst) || 0), 0)

    // The ORIGINAL plan anchor (first baseline) - timeline creep deducts from the score.
    const baseListAll = Array.isArray(baseRes.data?.baselines) ? baseRes.data!.baselines as { entries?: GanttEntry[] }[] : []
    const firstBase = baseListAll.find(b => b.entries?.length)
    let originalAnchor: { endDate: string; durationDays: number } | null = null
    if (firstBase?.entries?.length) {
      let bStart = '', bEnd = ''
      for (const e of firstBase.entries) for (const s of entrySegments(e)) {
        if (!s.startDate || !s.endDate) continue
        if (!bStart || s.startDate < bStart) bStart = s.startDate
        if (!bEnd || s.endDate > bEnd) bEnd = s.endDate
      }
      if (bStart && bEnd) originalAnchor = { endDate: bEnd, durationDays: Math.max(1, workingDaysBetween(bStart, bEnd)) }
    }

    const card: Scorecard = computeScorecard({
      estimate, actuals: [], subbies, gantt, today: todayIso,
      actualLabourHours: hoursRows.length ? totalHours : null,
      actualSupplyCost: (costsRes.data ?? []).length ? supplyCost : null,
      baseline: originalAnchor,
    })

    // Done / upcoming from the claims.
    const doneLines: ProjectReport['doneLines'] = []
    const upcoming: ProjectReport['upcoming'] = []
    let forecastEnd = ''
    const currentStart = new Map<string, string>()
    for (const e of gantt) {
      for (const s of entrySegments(e)) {
        if (s.endDate && s.endDate > forecastEnd) forecastEnd = s.endDate
        if (s.startDate) {
          const ex = currentStart.get(e.category)
          if (!ex || s.startDate < ex) currentStart.set(e.category, s.startDate)
        }
      }
      for (const { costType, seg } of entryClaimSegments(e)) {
        if (!seg.startDate || !seg.endDate) continue
        const label = costType ? costType.charAt(0).toUpperCase() + costType.slice(1) : ''
        if (seg.startDate <= todayIso && seg.endDate >= doneFrom) {
          doneLines.push({ category: e.category, label, start: seg.startDate, end: seg.endDate, donePct: segmentElapsed(seg.startDate, seg.endDate, todayIso) })
        }
        if (seg.endDate > todayIso && seg.startDate <= planTo) {
          upcoming.push({ category: e.category, label, start: seg.startDate, end: seg.endDate })
        }
      }
    }
    doneLines.sort((a, b) => a.start.localeCompare(b.start) || a.category.localeCompare(b.category))
    upcoming.sort((a, b) => a.start.localeCompare(b.start) || a.category.localeCompare(b.category))

    // Slip vs the latest office baseline (start-date slip, worst first).
    const baseList = Array.isArray(baseRes.data?.baselines) ? baseRes.data!.baselines as { entries?: GanttEntry[] }[] : []
    const latestBase = baseList[baseList.length - 1]
    const slips: ProjectReport['slips'] = []
    if (latestBase?.entries?.length) {
      for (const be of latestBase.entries) {
        let bStart = ''
        for (const s of entrySegments(be)) if (s.startDate && (!bStart || s.startDate < bStart)) bStart = s.startDate
        const cur = bStart ? currentStart.get(be.category) : undefined
        if (bStart && cur) {
          const days = Math.round((new Date(cur).getTime() - new Date(bStart).getTime()) / 86400000)
          if (days > 0) slips.push({ category: be.category, days })
        }
      }
      slips.sort((a, b) => b.days - a.days)
    }

    const plannedEnd = (p.planned_completion as string) || ''
    const slipDays = forecastEnd && plannedEnd
      ? Math.round((new Date(forecastEnd).getTime() - new Date(plannedEnd).getTime()) / 86400000)
      : null

    const hoursLastMonth = hoursRows.filter(r => r.week >= doneFrom && r.week <= iso(new Date(now.getTime() + 7 * 86400000))).reduce((s, r) => s + r.hours, 0)

    const lever = (key: string) => card.levers.find(l => l.key === key)
    const lab = lever('labour'), mat = lever('materials'), sub = lever('subbies')
    const levers: ProjectReport['levers'] = []
    if (lab && lab.budget > 0) levers.push({
      label: 'Labour',
      used: `${Math.round(lab.actual / STD_LABOUR_RATE)}h used of ${Math.round(lab.budget / STD_LABOUR_RATE)}h allowed`,
      base: `${Math.round(lab.progressPct * 100)}% of its work elapsed`,
    })
    if (mat && mat.budget > 0) levers.push({
      label: 'Materials', used: `${money(mat.actual)} of ${money(mat.budget)} allowance`,
      base: `${Math.round(mat.progressPct * 100)}% of its work elapsed`,
    })
    if (sub && sub.budget > 0) levers.push({
      label: 'Subcontractors', used: `${money(sub.actual)} committed of ${money(sub.budget)} allowance`, base: '',
    })

    // Variations raised since the window opened (any status).
    const variations = allEst
      .filter(e => e.parent_estimate_id && ((e.sent_at as string) || (e.created_at as string) || '') >= doneFrom && !e.archived)
      .map(e => ({
        number: Number(e.variation_number) || 0,
        reason: ((e.variation_reason as string) || (e.name as string) || '').slice(0, 90),
        amount: e.variation_amount != null ? Number(e.variation_amount) : 0,
        status: e.status as string,
      }))
      .sort((a, b) => a.number - b.number)

    const scheduleNote = card.schedule
      ? card.schedule.overrunDays > 0
        ? `${card.schedule.overrunDays}d over the original plan (${Math.round(card.schedule.overrunPct * 100)}%)${card.schedule.penalty > 0 ? ` - score penalty -${card.schedule.penalty} (cost score ${card.costScore})` : ' - within grace'}`
        : 'On or under the original baseline plan'
      : 'No baseline set - timeline creep not scored'

    reports.push({
      name: (p.name as string) || '', address: (p.address as string) || '', status: (p.status as string) || '',
      progressPct: card.progressPct,
      score: card.score,
      scheduleNote,
      scoreLabel: card.score === null ? '' : card.score >= 100 ? 'ahead of budget' : card.score >= 88 ? 'watch' : 'over budget',
      forecastEnd, plannedEnd, slipDays,
      hoursLastMonth,
      doneLines, upcoming, slips, baselineSet: !!latestBase?.entries?.length,
      levers,
      toolboxCount: tbRes.count ?? 0,
      incidentCount: incRes.count ?? 0,
      inductionCount: indRes.count ?? 0,
      variations,
    })
  }

  const report: MonthlyReport = {
    foreman: session.name,
    generatedAt: todayIso,
    doneWindow: { from: doneFrom, to: todayIso },
    planWindow: { from: todayIso, to: planTo },
    projects: reports.sort((a, b) => a.name.localeCompare(b.name)),
  }

  const buffer = await renderToBuffer(React.createElement(MonthlyReportPdf, { report }) as never)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="monthly-report-${session.name.replace(/[^\w]+/g, '-').toLowerCase()}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
