import { NextRequest, NextResponse } from 'next/server'
import { sendProposalEmail, isValidEmail } from '@/lib/email'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Same-origin gate — matches the other internal mutation routes (e.g. /api/xero/sync-now). */
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
 * POST /api/proposals/send
 *
 * Emails a design proposal to the client. The client (browser) posts the proposal's display
 * fields + acceptance token; the server builds the public proposal URL and sends via Resend.
 * Same-origin gated. Tokens/keys never leave the server.
 *
 * Body: { clientName, clientEmail, acceptanceToken, introText? }
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }
  // Cap email sends per IP — the same-origin gate is spoofable by a non-browser client, so this stops
  // it being turned into a spam/cost cannon. 20 / 10 min easily covers real use.
  const rl = rateLimit(`send:${clientIp(request)}`, 20, 10 * 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })

  const body = await request.json().catch(() => null)
  const clientEmail = typeof body?.clientEmail === 'string' ? body.clientEmail.trim() : ''
  const acceptanceToken = typeof body?.acceptanceToken === 'string' ? body.acceptanceToken.trim() : ''
  const clientName = typeof body?.clientName === 'string' ? body.clientName : ''
  const clientName2 = typeof body?.clientName2 === 'string' ? body.clientName2 : undefined
  const projectAddress = typeof body?.projectAddress === 'string' ? body.projectAddress : undefined
  const message = typeof body?.emailMessage === 'string' ? body.emailMessage : undefined
  const cc = typeof body?.ccEmails === 'string' ? body.ccEmails : undefined

  if (!clientEmail) return NextResponse.json({ ok: false, error: 'no_client_email' }, { status: 400 })
  if (!isValidEmail(clientEmail)) return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
  if (!acceptanceToken) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/+$/, '')
  const proposalUrl = `${appUrl}/proposal/${encodeURIComponent(acceptanceToken)}`

  const result = await sendProposalEmail({ to: clientEmail, clientName, clientName2, proposalUrl, projectAddress, message, cc })
  if (!result.ok) {
    // 422 for "you haven't set it up yet" so the client can show a setup hint; 502 for send failures.
    const status = result.error === 'email_not_configured' ? 422 : 502
    return NextResponse.json(result, { status })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
