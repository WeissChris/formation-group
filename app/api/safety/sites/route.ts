import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapSafetySite, nextShortRef, DEFAULT_BOARD_HAZARDS } from '@/lib/safety'

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

/** GET /api/safety/sites -> all safety sites + the projects linked to each. */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const [sitesRes, projRes] = await Promise.all([
    supabaseAdmin.from('sf_sites').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('fg_projects').select('id, name, entity, safety_site_id').not('safety_site_id', 'is', null),
  ])
  const sites = (sitesRes.data ?? []).map(mapSafetySite)
  const links = (projRes.data ?? []).map(p => ({
    projectId: p.id as string, name: p.name as string, entity: p.entity as string, siteId: p.safety_site_id as string,
  }))
  return NextResponse.json({ ok: true, sites, links })
}

/**
 * POST /api/safety/sites -> create a site (+ default board), optionally seeded from and linked to
 * a project: { projectId } uses the project's address/entity/foreman; or { address, entity } raw.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { projectId?: string; address?: string; entity?: string }
  let address = (body.address || '').trim()
  let entity: 'formation' | 'lume' = body.entity === 'lume' ? 'lume' : 'formation'
  let supervisor = ''
  let projectId = body.projectId || null

  if (projectId) {
    const { data: proj } = await supabaseAdmin.from('fg_projects').select('*').eq('id', projectId).maybeSingle()
    if (!proj) return NextResponse.json({ ok: false, error: 'project_not_found' }, { status: 404 })
    address = address || (proj.address as string) || (proj.name as string)
    entity = (proj.entity as 'formation' | 'lume') || entity
    supervisor = (proj.foreman as string) || ''
    if (proj.safety_site_id) return NextResponse.json({ ok: false, error: 'already_linked' }, { status: 409 })
  }
  if (!address) return NextResponse.json({ ok: false, error: 'address_required' }, { status: 400 })

  const year = new Date().getFullYear()
  const prefix = entity === 'lume' ? 'LUME' : 'FORM'
  const { count } = await supabaseAdmin.from('sf_sites').select('id', { count: 'exact', head: true })
    .like('short_ref', `${prefix}-${year}-%`)
  // Retry a couple of times on the (rare) short-ref race - unique constraint rejects duplicates.
  let site: Record<string, unknown> | null = null
  for (let attempt = 0; attempt < 3 && !site; attempt++) {
    const shortRef = nextShortRef(entity, year, (count ?? 0) + attempt)
    const { data, error } = await supabaseAdmin.from('sf_sites')
      .insert({ short_ref: shortRef, entity, address })
      .select('*').single()
    if (!error && data) site = data
    else if (error && !/duplicate|unique/i.test(error.message)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }
  if (!site) return NextResponse.json({ ok: false, error: 'short_ref_race' }, { status: 500 })

  await supabaseAdmin.from('sf_site_boards').insert({
    site_id: site.id,
    supervisor_name_number: supervisor,
    hazards: DEFAULT_BOARD_HAZARDS,
  })
  if (projectId) {
    await supabaseAdmin.from('fg_projects').update({ safety_site_id: site.id }).eq('id', projectId)
  }
  return NextResponse.json({ ok: true, site: mapSafetySite(site) })
}
