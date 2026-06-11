import { NextRequest, NextResponse } from 'next/server'
import { sendProposalEmail, isValidEmail } from '@/lib/email'

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

  const body = await request.json().catch(() => null)
  const clientEmail = typeof body?.clientEmail === 'string' ? body.clientEmail.trim() : ''
  const acceptanceToken = typeof body?.acceptanceToken === 'string' ? body.acceptanceToken.trim() : ''
  const clientName = typeof body?.clientName === 'string' ? body.clientName : ''
  const projectAddress = typeof body?.projectAddress === 'string' ? body.projectAddress : undefined
  const message = typeof body?.emailMessage === 'string' ? body.emailMessage : undefined

  if (!clientEmail) return NextResponse.json({ ok: false, error: 'no_client_email' }, { status: 400 })
  if (!isValidEmail(clientEmail)) return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
  if (!acceptanceToken) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/+$/, '')
  const proposalUrl = `${appUrl}/proposal/${encodeURIComponent(acceptanceToken)}`

  const result = await sendProposalEmail({ to: clientEmail, clientName, proposalUrl, projectAddress, message })
  if (!result.ok) {
    // 422 for "you haven't set it up yet" so the client can show a setup hint; 502 for send failures.
    const status = result.error === 'email_not_configured' ? 422 : 502
    return NextResponse.json(result, { status })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
