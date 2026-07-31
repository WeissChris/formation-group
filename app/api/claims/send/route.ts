import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { sendInvoiceEmail, isValidEmail } from '@/lib/email'
import { InvoicePdf } from '@/lib/invoicePdf'
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
  const message = typeof body?.message === 'string' ? body.message.slice(0, 4000) : undefined
  const cc = typeof body?.cc === 'string' ? body.cc : undefined
  const subtotalEx = Number(body?.subtotalEx)
  const gst = Number(body?.gst)
  const total = Number(body?.total)
  type RawLine = { description?: unknown; amount?: unknown; claimedToDate?: unknown; remaining?: unknown; contract?: unknown }
  const num = (v: unknown) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined)
  const parseLines = (raw: unknown) => Array.isArray(raw)
    ? (raw as unknown[])
        .map(l => (l && typeof l === 'object' ? l as RawLine : null))
        .filter((l): l is RawLine => !!l)
        .map(l => ({
          description: String(l.description ?? ''),
          amount: Number(l.amount),
          claimedToDate: num(l.claimedToDate),
          remaining: num(l.remaining),
          contract: num(l.contract),
        }))
        .filter(l => l.description && Number.isFinite(l.amount))
        .slice(0, 100)
    : []
  const lines = parseLines(body?.lines)
  // The PDF's full claim schedule (zero-claim rows included so the columns reconcile);
  // falls back to the billed lines for older clients.
  const scheduleParsed = parseLines(body?.schedule)
  const schedule = scheduleParsed.length > 0 ? scheduleParsed : lines

  if (!isValidEmail(to) || !invoiceNumber || lines.length === 0 ||
      !Number.isFinite(subtotalEx) || !Number.isFinite(gst) || !Number.isFinite(total)) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  // The tax invoice itself is a PDF attachment - payment details, terms, ABN and the business
  // address live on the document, not in the email body. Invoice date = the send date.
  const buffer = await renderToBuffer(React.createElement(InvoicePdf, {
    inv: {
      invoiceNumber, description, clientName, projectAddress, lines: schedule, subtotalEx, gst, total, comments,
      invoiceDate: new Date().toISOString(),
    },
  }) as never)
  const attachments = [{ filename: `${invoiceNumber.replace(/[^\w.-]+/g, '_')}.pdf`, content: Buffer.from(buffer).toString('base64') }]

  const res = await sendInvoiceEmail({ to, cc, clientName, invoiceNumber, description, projectAddress, lines, subtotalEx, gst, total, comments, message, attachments })
  return NextResponse.json(res, { status: res.ok ? 200 : 502 })
}
