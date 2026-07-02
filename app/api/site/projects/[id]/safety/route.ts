import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { mapSafetySite, mapSiteBoard, mapSiteVisit } from '@/lib/safety'

export const runtime = 'nodejs'

/**
 * GET /api/site/projects/[id]/safety -> the foreman's safety snapshot for this project:
 * the linked safety site + board summary + who's on site now + today's visits. Ownership
 * enforced like every /api/site route. site: null when no safety site is linked yet.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const siteId = project.safety_site_id as string | null
  if (!siteId) return NextResponse.json({ ok: true, site: null })

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const [siteRes, boardRes, openRes, todayRes, indCountRes] = await Promise.all([
    supabaseAdmin.from('sf_sites').select('*').eq('id', siteId).maybeSingle(),
    supabaseAdmin.from('sf_site_boards').select('*').eq('site_id', siteId).maybeSingle(),
    supabaseAdmin.from('sf_site_visits').select('*').eq('site_id', siteId).is('signed_out_at', null).order('signed_in_at', { ascending: false }),
    supabaseAdmin.from('sf_site_visits').select('*').eq('site_id', siteId).gte('signed_in_at', todayStart.toISOString()).order('signed_in_at', { ascending: false }),
    supabaseAdmin.from('sf_inductions').select('id', { count: 'exact', head: true }).eq('site_id', siteId),
  ])
  if (!siteRes.data) return NextResponse.json({ ok: true, site: null })

  return NextResponse.json({
    ok: true,
    site: mapSafetySite(siteRes.data),
    board: boardRes.data ? mapSiteBoard(boardRes.data) : null,
    onSiteNow: (openRes.data ?? []).map(mapSiteVisit),
    today: (todayRes.data ?? []).map(mapSiteVisit),
    inductionCount: indCountRes.count ?? 0,
  })
}
