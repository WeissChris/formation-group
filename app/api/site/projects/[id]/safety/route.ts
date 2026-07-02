import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { mapSafetySite, mapSiteBoard, mapSiteVisit } from '@/lib/safety'
import { mapSwms, mapToolbox, mapIncident } from '@/lib/safetyDocs'
import { mapPrequalDocument, companyCompliance } from '@/lib/safetyCompliance'

export const runtime = 'nodejs'

/**
 * GET /api/site/projects/[id]/safety -> the foreman's safety snapshot for this project:
 * the linked safety site + board summary + who's on site now + today's visits, PLUS the
 * project's safety docs (SWMS with ack counts, toolbox meetings, incidents). Ownership
 * enforced like every /api/site route. site: null when no safety site is linked yet
 * (docs still returned - SWMS/toolbox/incidents are project-scoped, not site-scoped).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const siteId = project.safety_site_id as string | null
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [swmsRes, ackRes, tbRes, incRes] = await Promise.all([
    supabaseAdmin.from('sf_swms').select('*').eq('project_id', params.id).eq('status', 'active').order('created_at', { ascending: true }),
    supabaseAdmin.from('sf_swms_acks').select('swms_id'),
    supabaseAdmin.from('sf_toolbox_meetings').select('*').eq('project_id', params.id).order('held_at', { ascending: false }).limit(20),
    supabaseAdmin.from('sf_incidents').select('*').eq('project_id', params.id).order('occurred_at', { ascending: false }).limit(20),
  ])
  const ackCounts = new Map<string, number>()
  for (const r of ackRes.data ?? []) {
    const k = r.swms_id as string
    ackCounts.set(k, (ackCounts.get(k) ?? 0) + 1)
  }
  // Subbie compliance badges: this project's subbie packages -> linked master companies -> doc status.
  const { data: pkgRows } = await supabaseAdmin.from('fg_subcontractors')
    .select('name, safety_company_id').eq('project_id', params.id)
  const companyIds = Array.from(new Set((pkgRows ?? []).map(p => p.safety_company_id).filter(Boolean))) as string[]
  const todayIso = new Date().toISOString().slice(0, 10)
  const complianceByCompany = new Map<string, string>()
  if (companyIds.length > 0) {
    const { data: docRows } = await supabaseAdmin.from('sf_prequal_documents').select('*').in('company_id', companyIds)
    const allDocs = (docRows ?? []).map(mapPrequalDocument)
    for (const cid of companyIds) {
      complianceByCompany.set(cid, companyCompliance(allDocs.filter(d => d.companyId === cid), todayIso).status)
    }
  }
  const subbieCompliance = (pkgRows ?? []).map(p => ({
    name: p.name as string,
    status: p.safety_company_id ? (complianceByCompany.get(p.safety_company_id as string) ?? 'missing_or_expired') : 'unlinked',
  }))

  const docs = {
    swms: (swmsRes.data ?? []).map(r => ({ ...mapSwms(r), ackCount: ackCounts.get(r.id as string) ?? 0 })),
    toolbox: (tbRes.data ?? []).map(mapToolbox),
    incidents: (incRes.data ?? []).map(mapIncident),
    subbieCompliance,
  }

  if (!siteId) return NextResponse.json({ ok: true, site: null, ...docs })

  const [siteRes, boardRes, openRes, todayRes, indCountRes] = await Promise.all([
    supabaseAdmin.from('sf_sites').select('*').eq('id', siteId).maybeSingle(),
    supabaseAdmin.from('sf_site_boards').select('*').eq('site_id', siteId).maybeSingle(),
    supabaseAdmin.from('sf_site_visits').select('*').eq('site_id', siteId).is('signed_out_at', null).order('signed_in_at', { ascending: false }),
    supabaseAdmin.from('sf_site_visits').select('*').eq('site_id', siteId).gte('signed_in_at', todayStart.toISOString()).order('signed_in_at', { ascending: false }),
    supabaseAdmin.from('sf_inductions').select('id', { count: 'exact', head: true }).eq('site_id', siteId),
  ])
  if (!siteRes.data) return NextResponse.json({ ok: true, site: null, ...docs })

  return NextResponse.json({
    ok: true,
    site: mapSafetySite(siteRes.data),
    board: boardRes.data ? mapSiteBoard(boardRes.data) : null,
    onSiteNow: (openRes.data ?? []).map(mapSiteVisit),
    today: (todayRes.data ?? []).map(mapSiteVisit),
    inductionCount: indCountRes.count ?? 0,
    ...docs,
  })
}

/**
 * POST /api/site/projects/[id]/safety -> foreman writes, dispatched by `kind`:
 *   { kind: 'toolbox', topic, notes, attendees: [{name, company}] }
 *   { kind: 'incident', occurredAt, location, description, people, severity, notifiable, actionsTaken }
 *   { kind: 'swms_ack', swmsId, name, company, phone }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  if (body.kind === 'toolbox') {
    const topic = String(body.topic || '').trim().slice(0, 200)
    if (!topic) return NextResponse.json({ ok: false, error: 'topic_required' }, { status: 400 })
    const { error } = await supabaseAdmin.from('sf_toolbox_meetings').insert({
      project_id: params.id,
      topic,
      notes: String(body.notes || '').slice(0, 4000),
      attendees: Array.isArray(body.attendees) ? body.attendees : [],
      held_by: session.name,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.kind === 'incident') {
    const description = String(body.description || '').trim().slice(0, 4000)
    if (!description) return NextResponse.json({ ok: false, error: 'description_required' }, { status: 400 })
    const severity = ['near_miss', 'minor', 'serious', 'critical'].includes(String(body.severity)) ? String(body.severity) : 'minor'
    const occurredAt = body.occurredAt ? new Date(String(body.occurredAt)) : new Date()
    const { error } = await supabaseAdmin.from('sf_incidents').insert({
      project_id: params.id,
      occurred_at: isNaN(occurredAt.getTime()) ? new Date().toISOString() : occurredAt.toISOString(),
      location: String(body.location || '').slice(0, 300),
      description,
      people: Array.isArray(body.people) ? body.people : [],
      severity,
      notifiable: !!body.notifiable,
      actions_taken: String(body.actionsTaken || '').slice(0, 4000),
      reported_by: session.name,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.kind === 'swms_ack') {
    const name = String(body.name || '').trim().slice(0, 120)
    const swmsId = String(body.swmsId || '')
    if (!name || !swmsId) return NextResponse.json({ ok: false, error: 'name_and_swms_required' }, { status: 400 })
    // The SWMS must belong to THIS project (ownership already checked at the project level).
    const { data: swms } = await supabaseAdmin.from('sf_swms').select('id').eq('id', swmsId).eq('project_id', params.id).maybeSingle()
    if (!swms) return NextResponse.json({ ok: false, error: 'swms_not_found' }, { status: 404 })
    const { error } = await supabaseAdmin.from('sf_swms_acks').insert({
      swms_id: swmsId, person_name: name,
      company: String(body.company || '').slice(0, 120),
      phone: String(body.phone || '').slice(0, 40),
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'unknown_kind' }, { status: 400 })
}
