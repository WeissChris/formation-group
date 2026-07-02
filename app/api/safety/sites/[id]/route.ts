import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapSafetySite, mapSiteBoard, mapSiteVisit, mapSiteInduction, boardToRow, type SiteBoard } from '@/lib/safety'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/** GET /api/safety/sites/[id] -> site + board + register (last 200 visits) + inductions + links. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const [siteRes, boardRes, visitsRes, indRes, projRes] = await Promise.all([
    supabaseAdmin.from('sf_sites').select('*').eq('id', params.id).maybeSingle(),
    supabaseAdmin.from('sf_site_boards').select('*').eq('site_id', params.id).maybeSingle(),
    supabaseAdmin.from('sf_site_visits').select('*').eq('site_id', params.id).order('signed_in_at', { ascending: false }).limit(200),
    supabaseAdmin.from('sf_inductions').select('*').eq('site_id', params.id).order('accepted_at', { ascending: false }),
    supabaseAdmin.from('fg_projects').select('id, name, entity').eq('safety_site_id', params.id),
  ])
  if (!siteRes.data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    site: mapSafetySite(siteRes.data),
    board: boardRes.data ? mapSiteBoard(boardRes.data) : null,
    visits: (visitsRes.data ?? []).map(mapSiteVisit),
    inductions: (indRes.data ?? []).map(mapSiteInduction),
    projects: (projRes.data ?? []).map(p => ({ id: p.id as string, name: p.name as string, entity: p.entity as string })),
  })
}

/** PATCH /api/safety/sites/[id] { board?, status?, address?, notes? } -> update board/site fields. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as {
    board?: Partial<SiteBoard>; status?: string; address?: string; notes?: string
  }

  if (body.board) {
    const row = boardToRow(body.board)
    if (Object.keys(row).length > 0) {
      const { error } = await supabaseAdmin.from('sf_site_boards')
        .upsert({ site_id: params.id, ...row, updated_at: new Date().toISOString() })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }
  const sitePatch: Record<string, unknown> = {}
  if (body.status !== undefined) sitePatch.status = body.status
  if (body.address !== undefined) sitePatch.address = body.address
  if (body.notes !== undefined) sitePatch.notes = body.notes
  if (Object.keys(sitePatch).length > 0) {
    const { error } = await supabaseAdmin.from('sf_sites').update(sitePatch).eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
