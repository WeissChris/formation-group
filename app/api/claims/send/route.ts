import { NextRequest, NextResponse } from 'next/server'
import { sendInvoiceEmail, isValidEmail } from '@/lib/email'
import { rateLimit, clientIp } from '@/lib/rateLimit'

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
 * POST /api/claims/send — emails a progress-claim invoice to the client. The browser posts the
 * display fields (nothing is looked up server-side); the server renders the branded email and
 * sends via Resend. Same-origin gated + rate limited like the other send routes.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const rl = rateLimit(`send:${clientIp(request)}`, 20, 10 * 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })

  const body = await request.json().catch(() => null)
  const to = typeof body?.to === 'string' ? body.to.trim() : ''
  const clientName = typeof body?.clientName === 'string' ? body.clientName : ''
  const invoiceNumber = typeof body?.invoiceNumber === 'string' ? body.invoiceNumber.trim() : ''
  const description = typeof body?.description === 'string' ? body.description : undefined
  const projectAddress = typeof body?.projectAddress === 'string' ? body.projectAddress : undefined
  const comments = typeof body?.comments === 'string' ? body.comments : undefined
  const cc = typeof body?.cc === 'string' ? body.cc : undefined
  const subtotalEx = Number(body?.subtotalEx)
  const gst = Number(body?.gst)
  const total = Number(body?.total)
  const lines = Array.isArray(body?.lines)
    ? (body.lines as unknown[])
        .map(l => (l && typeof l === 'object' ? l as { description?: unknown; amount?: unknown } : null))
        .filter((l): l is { description?: unknown; amount?: unknown } => !!l)
        .map(l => ({ description: String(l.description ?? ''), amount: Number(l.amount) }))
        .filter(l => l.description && Number.isFinite(l.amount))
        .slice(0, 100)
    : []

  if (!isValidEmail(to) || !invoiceNumber || lines.length === 0 ||
      !Number.isFinite(subtotalEx) || !Number.isFinite(gst) || !Number.isFinite(total)) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const res = await sendInvoiceEmail({ to, cc, clientName, invoiceNumber, description, projectAddress, lines, subtotalEx, gst, total, comments })
  return NextResponse.json(res, { status: res.ok ? 200 : 502 })
}
