import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'

export const runtime = 'nodejs'

/**
 * GET /api/site/projects/[id]/hours -> the project's REAL logged labour hours from Xero
 * timesheets (fg_xero_project_hours, written by lib/xeroHoursSync.ts). totalHours is null when
 * the project has no hour rows yet (not yet synced / no job-tagged timesheets) so the Scorecard
 * can fall back to the $-derived labour figure instead of showing a false 0h. Ownership enforced.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const { data } = await supabaseAdmin
    .from('fg_xero_project_hours')
    .select('week_ending, hours')
    .eq('project_id', params.id)
    .order('week_ending', { ascending: true })

  const weeks = (data ?? []).map(r => ({ weekEnding: r.week_ending as string, hours: Number(r.hours) || 0 }))
  const totalHours = weeks.length ? Math.round(weeks.reduce((s, w) => s + w.hours, 0) * 100) / 100 : null

  return NextResponse.json({ ok: true, totalHours, weeks })
}
