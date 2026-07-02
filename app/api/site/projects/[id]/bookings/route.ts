import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The subbie contact/booking tracker's persistent state (booked tick + comment per category).
// The LIST of subbie scopes + their due dates is derived client-side from the gantt, so a
// schedule change moves the due dates without touching these rows.

/** GET /api/site/projects/[id]/bookings -> the foreman's booking state rows. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, bookings: [] })

  const { data } = await supabaseAdmin.from('fg_subbie_bookings')
    .select('category, booked, comment, updated_at').eq('project_id', params.id)
  return NextResponse.json({
    ok: true,
    bookings: (data ?? []).map(r => ({
      category: r.category as string,
      booked: !!r.booked,
      comment: (r.comment as string) || '',
      updatedAt: r.updated_at as string,
    })),
  })
}

/** POST /api/site/projects/[id]/bookings { category, booked?, comment? } -> upsert one row. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { category?: string; booked?: boolean; comment?: string }
  const category = (body.category || '').trim().slice(0, 300)
  if (!category) return NextResponse.json({ ok: false, error: 'category_required' }, { status: 400 })

  const patch: Record<string, unknown> = {
    project_id: params.id, category, updated_by: session.name, updated_at: new Date().toISOString(),
  }
  if (typeof body.booked === 'boolean') patch.booked = body.booked
  if (typeof body.comment === 'string') patch.comment = body.comment.slice(0, 1000)

  // Upsert on (project, category); merge semantics - a tick doesn't wipe the comment and vice
  // versa because we only include the fields the caller sent (plus the identity columns).
  const { data: existing } = await supabaseAdmin.from('fg_subbie_bookings')
    .select('id').eq('project_id', params.id).eq('category', category).maybeSingle()
  const { error } = existing
    ? await supabaseAdmin.from('fg_subbie_bookings').update(patch).eq('id', existing.id)
    : await supabaseAdmin.from('fg_subbie_bookings').insert(patch)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
