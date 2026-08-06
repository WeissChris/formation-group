import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom } from '@/lib/siteServer'
import { isLabourAccount } from '@/lib/labour'
import { entrySegments } from '@/lib/ganttForecast'
import { workingDaysBetween } from '@/lib/ganttSchedule'
import type { GanttEntry } from '@/types'

export const runtime = 'nodejs'

/**
 * GET /api/site/overview?ids=a,b,c -> the Supabase-only per-project inputs the office Foremen
 * overview needs, batched across every active project in a handful of queries (instead of the
 * cockpit's per-project fetch fan-out): Xero labour hours + supply spend, the ORIGINAL baseline
 * anchor (first baseline - schedule-creep penalty input), and the unconfirmed-materials count.
 * OFFICE SESSION ONLY - this is a cross-foreman view, so a supervisor session is rejected.
 */
export async function GET(request: NextRequest) {
  const session = siteSessionFrom(request)
  if (!session?.office) return NextResponse.json({ ok: false }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const ids = (request.nextUrl.searchParams.get('ids') || '')
    .split(',').map(s => s.trim()).filter(Boolean).slice(0, 50)
  if (ids.length === 0) return NextResponse.json({ ok: true, projects: {} })

  const [hoursRes, costsRes, baselinesRes, materialsRes] = await Promise.all([
    supabaseAdmin.from('fg_xero_project_hours').select('project_id, hours').in('project_id', ids),
    supabaseAdmin.from('fg_xero_project_costs').select('project_id, account_name, amount_ex_gst').in('project_id', ids),
    supabaseAdmin.from('fg_gantt_baselines').select('project_id, baselines').in('project_id', ids),
    supabaseAdmin.from('fg_project_materials').select('project_id, materials').in('project_id', ids),
  ])

  type Row = {
    totalHours: number | null
    supplyCost: number | null
    original: { endDate: string; durationDays: number } | null
    unconfirmedMaterials: number
  }
  const out: Record<string, Row> = {}
  const row = (id: string): Row => (out[id] ??= { totalHours: null, supplyCost: null, original: null, unconfirmedMaterials: 0 })

  for (const r of hoursRes.data ?? []) {
    const p = row(r.project_id as string)
    p.totalHours = Math.round(((p.totalHours ?? 0) + (Number(r.hours) || 0)) * 100) / 100
  }
  // Mirror the cockpit hours route: supply = every cost row EXCEPT labour + subcontractor accounts,
  // and non-null only when the project has ANY cost rows (so the Scorecard falls back, not false 0).
  for (const r of costsRes.data ?? []) {
    const p = row(r.project_id as string)
    if (p.supplyCost === null) p.supplyCost = 0
    const name = (r.account_name as string) || ''
    if (!isLabourAccount(name) && !/subcontract/i.test(name)) {
      p.supplyCost = Math.round((p.supplyCost + (Number(r.amount_ex_gst) || 0)) * 100) / 100
    }
  }
  // ORIGINAL plan anchor = the FIRST baseline with entries (same as the cockpit baseline route).
  for (const r of baselinesRes.data ?? []) {
    const list = Array.isArray(r.baselines) ? r.baselines as { entries?: GanttEntry[] }[] : []
    const first = list.find(b => b.entries?.length)
    if (!first?.entries?.length) continue
    let start = '', end = ''
    for (const e of first.entries) for (const s of entrySegments(e)) {
      if (!s.startDate || !s.endDate) continue
      if (!start || s.startDate < start) start = s.startDate
      if (!end || s.endDate > end) end = s.endDate
    }
    if (start && end) row(r.project_id as string).original = { endDate: end, durationDays: Math.max(1, workingDaysBetween(start, end)) }
  }
  for (const r of materialsRes.data ?? []) {
    const items = Array.isArray(r.materials) ? r.materials as { confirmed?: boolean }[] : []
    row(r.project_id as string).unconfirmedMaterials = items.filter(m => !m.confirmed).length
  }

  return NextResponse.json({ ok: true, projects: out })
}
