import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendSafetyEmail } from '@/lib/safetyChase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OFFICE_EMAIL = () => process.env.SAFETY_OFFICE_EMAIL || 'chris@formationlandscapes.com.au'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

/**
 * POST /api/variations/viewed { acceptanceToken }
 *
 * Fired by the public variation page when a client opens it. Records the first-view timestamp on
 * fg_estimates so the foreman's cockpit can show "Read by client" rather than just "Sent", and
 * notifies the office once. Idempotent: the conditional UPDATE (first_viewed_at IS NULL) is the
 * atomic guard, so only the request that actually sets the timestamp sends the email - reloads and
 * concurrent opens don't re-notify. Mirrors /api/proposals/viewed.
 *
 * Only 'sent' variations count, so an already-answered variation doesn't trigger anything.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const token = typeof body?.acceptanceToken === 'string' ? body.acceptanceToken.trim() : ''
  if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 200 })

  const { data: existing } = await supabaseAdmin
    .from('fg_estimates')
    .select('id, status, first_viewed_at, parent_estimate_id')
    .eq('acceptance_token', token)
    .maybeSingle()
  if (!existing || !existing.parent_estimate_id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 200 })
  if (existing.first_viewed_at) return NextResponse.json({ ok: true, firstView: false }, { status: 200 })
  if (existing.status !== 'sent') {
    return NextResponse.json({ ok: true, firstView: false, skipped: existing.status }, { status: 200 })
  }

  // Atomic first-view claim: only the request that flips first_viewed_at from NULL gets a row back.
  const now = new Date().toISOString()
  const { data: claimed } = await supabaseAdmin
    .from('fg_estimates')
    .update({ first_viewed_at: now })
    .eq('acceptance_token', token)
    .is('first_viewed_at', null)
    .select('project_name, variation_number, variation_amount, raised_by')

  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, firstView: false }, { status: 200 })
  const v = claimed[0]

  await sendSafetyEmail(
    OFFICE_EMAIL(),
    `Client opened Variation VMO-${v.variation_number ?? '?'} - ${(v.project_name as string) || 'a project'}`,
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
      <p>The client has just opened the approval page for
      <strong>VMO-${v.variation_number ?? '?'}</strong> on ${esc((v.project_name as string) || 'a project')}.</p>
      <p style="color:#6b6660;font-size:12px">No response yet - you'll get another note if they approve or decline.
      ${v.raised_by ? `Raised by ${esc(v.raised_by as string)}.` : ''}</p>
    </div>`,
  ).catch(() => undefined)

  return NextResponse.json({ ok: true, firstView: true })
}
