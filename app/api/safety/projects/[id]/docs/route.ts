import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapSwms, mapSssp, mapToolbox, mapIncident } from '@/lib/safetyDocs'
import { templatesForEntity } from '@/lib/safetyContent'

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

/** GET /api/safety/projects/[id]/docs -> the office's per-project safety view: SWMS (+ack
 *  counts), SSSP versions, toolbox meetings, incidents, and the templates available to the
 *  project's entity. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const { data: proj } = await supabaseAdmin.from('fg_projects')
    .select('id, name, entity, address, foreman, safety_site_id').eq('id', params.id).maybeSingle()
  if (!proj) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  const [swmsRes, ackRes, ssspRes, tbRes, incRes] = await Promise.all([
    supabaseAdmin.from('sf_swms').select('*').eq('project_id', params.id).order('created_at', { ascending: true }),
    supabaseAdmin.from('sf_swms_acks').select('swms_id'),
    supabaseAdmin.from('sf_sssps').select('*').eq('project_id', params.id).order('version', { ascending: false }),
    supabaseAdmin.from('sf_toolbox_meetings').select('*').eq('project_id', params.id).order('held_at', { ascending: false }).limit(50),
    supabaseAdmin.from('sf_incidents').select('*').eq('project_id', params.id).order('occurred_at', { ascending: false }),
  ])
  const ackCounts = new Map<string, number>()
  for (const r of ackRes.data ?? []) {
    const k = r.swms_id as string
    ackCounts.set(k, (ackCounts.get(k) ?? 0) + 1)
  }
  const entity = (proj.entity as string) === 'lume' ? 'lume' : 'formation'

  return NextResponse.json({
    ok: true,
    project: { id: proj.id, name: proj.name, entity, address: proj.address || '', foreman: proj.foreman || '' },
    swms: (swmsRes.data ?? []).map(r => ({ ...mapSwms(r), ackCount: ackCounts.get(r.id as string) ?? 0 })),
    sssps: (ssspRes.data ?? []).map(mapSssp),
    toolbox: (tbRes.data ?? []).map(mapToolbox),
    incidents: (incRes.data ?? []).map(mapIncident),
    templates: templatesForEntity(entity).map(t => ({
      key: t.key,
      activityName: t.template.activity_name,
      highRisk: t.template.high_risk_categories,
      approved: t.template._meta?.approved_for_site_use === true,
    })),
  })
}

/** POST /api/safety/projects/[id]/docs { kind: 'swms', templateKey } -> instantiate a SWMS
 *  from a template (content snapshot on the row); { kind: 'sssp', answers } -> save a new SSSP
 *  version against the entity's schema. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const { data: proj } = await supabaseAdmin.from('fg_projects')
    .select('id, entity').eq('id', params.id).maybeSingle()
  if (!proj) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  const entity = (proj.entity as string) === 'lume' ? 'lume' : 'formation'

  const body = await request.json().catch(() => ({})) as {
    kind?: string; templateKey?: string; answers?: Record<string, unknown>
  }

  if (body.kind === 'swms') {
    const found = templatesForEntity(entity).find(t => t.key === body.templateKey)
    if (!found) return NextResponse.json({ ok: false, error: 'template_not_found' }, { status: 404 })
    const t = found.template
    const { data, error } = await supabaseAdmin.from('sf_swms').insert({
      project_id: params.id,
      template_key: found.key,
      activity_name: t.activity_name,
      content: {
        high_risk_categories: t.high_risk_categories, hazards: t.hazards,
        ppe: t.ppe, tasks: t.tasks, _meta: t._meta,
      },
    }).select('*').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, swms: mapSwms(data) })
  }

  if (body.kind === 'sssp') {
    const { data: latest } = await supabaseAdmin.from('sf_sssps')
      .select('version').eq('project_id', params.id).order('version', { ascending: false }).limit(1).maybeSingle()
    const version = (Number(latest?.version) || 0) + 1
    const { data, error } = await supabaseAdmin.from('sf_sssps').insert({
      project_id: params.id, version, schema_key: entity,
      answers: body.answers && typeof body.answers === 'object' ? body.answers : {},
    }).select('*').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, sssp: mapSssp(data) })
  }

  return NextResponse.json({ ok: false, error: 'unknown_kind' }, { status: 400 })
}
