import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom } from '@/lib/siteServer'
import { DEFAULT_ROSTER, type IntroRoster } from '@/lib/introPack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// The company-wide intro-pack roster (Meet the team + manager contacts) - a single shared row so
// edits flow to every pack. Any authenticated supervisor session may read/write it.

export async function GET(request: NextRequest) {
  if (!siteSessionFrom(request)) return NextResponse.json({ ok: false }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, roster: DEFAULT_ROSTER })
  const { data } = await supabaseAdmin.from('fg_intro_roster').select('data').eq('id', 'default').maybeSingle()
  return NextResponse.json({ ok: true, roster: (data?.data as IntroRoster) ?? DEFAULT_ROSTER })
}

export async function POST(request: NextRequest) {
  if (!siteSessionFrom(request)) return NextResponse.json({ ok: false }, { status: 401 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const body = await request.json().catch(() => ({})) as { roster?: IntroRoster }
  if (!body.roster) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })
  const patch = { id: 'default', data: { ...body.roster, updatedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }
  const { data: existing } = await supabaseAdmin.from('fg_intro_roster').select('id').eq('id', 'default').maybeSingle()
  const { error } = existing
    ? await supabaseAdmin.from('fg_intro_roster').update(patch).eq('id', 'default')
    : await supabaseAdmin.from('fg_intro_roster').insert(patch)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
