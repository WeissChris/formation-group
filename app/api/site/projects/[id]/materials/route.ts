import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import { sanitizeMaterials, type SiteMaterial } from '@/lib/projectMaterials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The foreman's per-project materials list (type / source / allowance / confirmed). One blob per
// project. Session-gated like every /api/site route.

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, materials: [] })

  const { data } = await supabaseAdmin.from('fg_project_materials').select('materials').eq('project_id', params.id).maybeSingle()
  return NextResponse.json({ ok: true, materials: sanitizeMaterials(data?.materials) })
}

/** POST { materials } -> replace the whole list (the client owns it and sends it in full). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { materials?: SiteMaterial[] }
  const materials = sanitizeMaterials(body.materials)
  const patch = { project_id: params.id, materials, updated_by: session.name, updated_at: new Date().toISOString() }

  const { data: existing } = await supabaseAdmin.from('fg_project_materials').select('project_id').eq('project_id', params.id).maybeSingle()
  const { error } = existing
    ? await supabaseAdmin.from('fg_project_materials').update(patch).eq('project_id', params.id)
    : await supabaseAdmin.from('fg_project_materials').insert(patch)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
