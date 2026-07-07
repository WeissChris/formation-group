import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import type { IntroPackData } from '@/lib/introPack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The per-project introduction pack overrides (welcome copy, dates, pool toggle, edited steps).
// One blob per project; the boilerplate content + roster live elsewhere. Session-gated like every
// /api/site route.

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, pack: {} })

  const { data } = await supabaseAdmin.from('fg_intro_packs').select('data').eq('project_id', params.id).maybeSingle()
  return NextResponse.json({ ok: true, pack: (data?.data as IntroPackData) ?? {} })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { data?: IntroPackData }
  const patch = { project_id: params.id, data: body.data ?? {}, updated_by: session.name, updated_at: new Date().toISOString() }
  const { data: existing } = await supabaseAdmin.from('fg_intro_packs').select('project_id').eq('project_id', params.id).maybeSingle()
  const { error } = existing
    ? await supabaseAdmin.from('fg_intro_packs').update(patch).eq('project_id', params.id)
    : await supabaseAdmin.from('fg_intro_packs').insert(patch)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
