import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { entrySegments } from '@/lib/ganttForecast'
import type { GanttEntry } from '@/types'

export const runtime = 'nodejs'

/**
 * GET /api/site/projects/[id]/baseline -> the LATEST office baseline reduced to per-category
 * earliest start + latest end, for the dashboard's slip card. baseline: null when the office
 * hasn't set one (the card tells the foreman to ask for a baseline). Ownership enforced.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, baseline: null })

  const { data } = await supabaseAdmin.from('fg_gantt_baselines')
    .select('baselines').eq('project_id', params.id).maybeSingle()
  const list = Array.isArray(data?.baselines) ? data!.baselines as { capturedAt?: string; entries?: GanttEntry[] }[] : []
  const latest = list[list.length - 1]
  if (!latest?.entries?.length) return NextResponse.json({ ok: true, baseline: null })

  const categories = latest.entries.map(e => {
    let start = '', end = ''
    for (const s of entrySegments(e)) {
      if (!s.startDate || !s.endDate) continue
      if (!start || s.startDate < start) start = s.startDate
      if (!end || s.endDate > end) end = s.endDate
    }
    return start ? { category: e.category, start, end } : null
  }).filter(Boolean)

  return NextResponse.json({ ok: true, baseline: { capturedAt: latest.capturedAt ?? '', categories } })
}
