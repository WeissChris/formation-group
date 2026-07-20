import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The subbie contact/booking tracker's persistent state: booked tick + an APPEND-ONLY,
// time-stamped comment log per category. The LIST of subbie scopes + their due dates is
// derived client-side from the gantt, so a schedule change moves the due dates without
// touching these rows.

interface BookingComment { text: string; by: string; at: string }

/** GET /api/site/projects/[id]/bookings -> the foreman's booking state rows. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, bookings: [] })

  const { data } = await supabaseAdmin.from('fg_subbie_bookings')
    .select('category, booked, comments, subbie_id, updated_at').eq('project_id', params.id)
  return NextResponse.json({
    ok: true,
    bookings: (data ?? []).map(r => ({
      category: r.category as string,
      booked: !!r.booked,
      comments: Array.isArray(r.comments) ? (r.comments as BookingComment[]) : [],
      subbieId: (r.subbie_id as string | null) || null,
      updatedAt: r.updated_at as string,
    })),
  })
}

/** POST /api/site/projects/[id]/bookings { category, booked?, addComment?, subbieId? } -> upsert
 *  the tick, the company link, and/or APPEND a time-stamped comment ({text, by: supervisor, at}).
 *  subbieId: a string links the scope to that subcontractor package, '' clears the link back to
 *  the trade-name guess, undefined leaves it alone. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const body = await request.json().catch(() => ({})) as { category?: string; booked?: boolean; addComment?: string; subbieId?: string }
  const category = (body.category || '').trim().slice(0, 300)
  if (!category) return NextResponse.json({ ok: false, error: 'category_required' }, { status: 400 })
  const addComment = typeof body.addComment === 'string' ? body.addComment.trim().slice(0, 1000) : ''

  const { data: existing } = await supabaseAdmin.from('fg_subbie_bookings')
    .select('id, comments').eq('project_id', params.id).eq('category', category).maybeSingle()

  const patch: Record<string, unknown> = {
    project_id: params.id, category, updated_by: session.name, updated_at: new Date().toISOString(),
  }
  if (typeof body.booked === 'boolean') patch.booked = body.booked
  if (typeof body.subbieId === 'string') patch.subbie_id = body.subbieId.trim().slice(0, 100) || null
  if (addComment) {
    const prior = Array.isArray(existing?.comments) ? existing!.comments as BookingComment[] : []
    patch.comments = [...prior, { text: addComment, by: session.name, at: new Date().toISOString() }]
  }

  const { error } = existing
    ? await supabaseAdmin.from('fg_subbie_bookings').update(patch).eq('id', existing.id)
    : await supabaseAdmin.from('fg_subbie_bookings').insert(patch)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
