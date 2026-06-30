import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'

export const runtime = 'nodejs'

/**
 * GET /api/site/projects/[id]/bootstrap -> the raw rows the office gantt needs to render + edit:
 * the project, its estimates (the gantt derives its CATEGORIES from the accepted estimate), its gantt
 * rows and its milestones. Returned as raw snake_case rows; the /site schedule page maps them with the
 * shared lib/storageAsync mappers and seeds localStorage, so the unmodified gantt reads them normally.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const [estimates, gantt, milestones] = await Promise.all([
    supabaseAdmin.from('fg_estimates').select('*').eq('project_id', params.id),
    supabaseAdmin.from('fg_gantt').select('*').eq('project_id', params.id),
    supabaseAdmin.from('fg_gantt_milestones').select('milestones').eq('project_id', params.id).maybeSingle(),
  ])

  return NextResponse.json({
    ok: true,
    project,
    estimates: estimates.data ?? [],
    gantt: gantt.data ?? [],
    milestones: (milestones.data?.milestones as unknown[]) ?? [],
  })
}
