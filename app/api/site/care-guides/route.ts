import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom } from '@/lib/siteServer'
import { DEFAULT_CARE_LIBRARY, type CareGuideLibrary } from '@/lib/handoverBooklet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The company-wide handover care-guide library (single shared row). Wording edits here flow to every
// booklet; per-job pruning lives on each booklet. Any authenticated supervisor/office session read/writes.

export async function GET(request: NextRequest) {
  if (!siteSessionFrom(request)) return NextResponse.json({ ok: false }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, library: { guides: DEFAULT_CARE_LIBRARY } })
  const { data } = await supabaseAdmin.from('fg_care_guide_library').select('data').eq('id', 'default').maybeSingle()
  const library = (data?.data as CareGuideLibrary) ?? { guides: DEFAULT_CARE_LIBRARY }
  if (!Array.isArray(library.guides) || library.guides.length === 0) library.guides = DEFAULT_CARE_LIBRARY
  return NextResponse.json({ ok: true, library })
}

export async function POST(request: NextRequest) {
  if (!siteSessionFrom(request)) return NextResponse.json({ ok: false }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const body = await request.json().catch(() => ({})) as { library?: CareGuideLibrary }
  if (!body.library || !Array.isArray(body.library.guides)) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })
  const guides = body.library.guides
    .map(g => ({ id: String(g.id || ''), element: String(g.element || '').slice(0, 120), body: String(g.body || '').slice(0, 4000) }))
    .filter(g => g.id)
    .slice(0, 40)
  const patch = { id: 'default', data: { guides, updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }
  const { data: existing } = await supabaseAdmin.from('fg_care_guide_library').select('id').eq('id', 'default').maybeSingle()
  const { error } = existing
    ? await supabaseAdmin.from('fg_care_guide_library').update(patch).eq('id', 'default')
    : await supabaseAdmin.from('fg_care_guide_library').insert(patch)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
