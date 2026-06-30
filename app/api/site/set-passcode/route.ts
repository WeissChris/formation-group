import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifySession, SESSION_COOKIE } from '@/lib/serverAuth'
import { hashPasscode } from '@/lib/siteAuth'

export const runtime = 'nodejs'

/**
 * POST /api/site/set-passcode { supervisorId, passcode } -> sets/clears a supervisor's /site passcode.
 * ADMIN ONLY: gated by the admin fg_session cookie. An empty/whitespace passcode clears it (disables
 * that supervisor's login). The plaintext is hashed (scrypt) and never persisted.
 */
export async function POST(request: NextRequest) {
  // Admin gate — only the office can set a supervisor's passcode.
  if (!verifySession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 })
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  }

  let body: { supervisorId?: unknown; passcode?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }
  if (typeof body.supervisorId !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }
  const plain = typeof body.passcode === 'string' ? body.passcode.trim() : ''
  if (plain && plain.length < 4) {
    return NextResponse.json({ ok: false, error: 'passcode_too_short' }, { status: 400 })
  }

  const passcode_hash = plain ? hashPasscode(plain) : null
  const { error } = await supabaseAdmin
    .from('fg_supervisors')
    .update({ passcode_hash })
    .eq('id', body.supervisorId)
  if (error) {
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, hasPasscode: !!passcode_hash })
}
