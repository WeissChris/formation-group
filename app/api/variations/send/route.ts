import { NextRequest, NextResponse } from 'next/server'
import { sendVariationEmail, isValidEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Same-origin gate — matches the other internal mutation routes. */
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
 * POST /api/variations/send — emails a variation to the client for digital approval.
 * The browser posts the display fields + the variation's acceptance token; the server builds the
 * public approval URL (/variation/<token>) and sends via Resend. Same-origin gated.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const clientEmail = typeof body?.clientEmail === 'string' ? body.clientEmail.trim() : ''
  const acceptanceToken = typeof body?.acceptanceToken === 'string' ? body.acceptanceToken.trim() : ''
  const clientName = typeof body?.clientName === 'string' ? body.clientName : ''
  const variationLabel = typeof body?.variationLabel === 'string' ? body.variationLabel : undefined
  const projectAddress = typeof body?.projectAddress === 'string' ? body.projectAddress : undefined
  const amountLabel = typeof body?.amountLabel === 'string' ? body.amountLabel : undefined
  const message = typeof body?.message === 'string' ? body.message : undefined
  const cc = typeof body?.ccEmails === 'string' ? body.ccEmails : undefined

  if (!clientEmail) return NextResponse.json({ ok: false, error: 'no_client_email' }, { status: 400 })
  if (!isValidEmail(clientEmail)) return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
  if (!acceptanceToken) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/+$/, '')
  const variationUrl = `${appUrl}/variation/${encodeURIComponent(acceptanceToken)}`

  const result = await sendVariationEmail({ to: clientEmail, clientName, variationUrl, variationLabel, projectAddress, amountLabel, message, cc })
  if (!result.ok) {
    const status = result.error === 'email_not_configured' ? 422 : 502
    return NextResponse.json(result, { status })
  }
  return NextResponse.json({ ok: true, id: result.id })
}
