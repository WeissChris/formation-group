import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/**
 * POST /api/projects/:id/xero-mapping
 *
 * Body: { tracking_category_id, tracking_option_id, tracking_option_name }
 * Upserts the mapping. Pass null/empty option_id to clear (DELETE).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: 'admin_not_configured' }, { status: 500 })
  }

  let body: { tracking_category_id?: string; tracking_option_id?: string; tracking_option_name?: string }
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 }) }

  const projectId = params.id

  // Clear mapping if the user picked the unmapped option
  if (!body.tracking_option_id) {
    await supabaseAdmin.from('fg_project_xero_mapping').delete().eq('project_id', projectId)
    return NextResponse.json({ ok: true, cleared: true })
  }

  if (!body.tracking_category_id || !body.tracking_option_name) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('fg_project_xero_mapping').upsert({
    project_id: projectId,
    tracking_category_id: body.tracking_category_id,
    tracking_option_id: body.tracking_option_id,
    tracking_option_name: body.tracking_option_name,
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * GET /api/projects/:id/xero-mapping
 *
 * Returns the current mapping for this project, or { mapping: null } if unmapped.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ mapping: null }, { status: 403 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ mapping: null })
  }
  const { data } = await supabaseAdmin
    .from('fg_project_xero_mapping')
    .select('*')
    .eq('project_id', params.id)
    .maybeSingle()
  return NextResponse.json({ mapping: data || null })
}
