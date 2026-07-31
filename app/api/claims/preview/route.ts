import React from 'react'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { InvoicePdf } from '@/lib/invoicePdf'

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
 * POST /api/claims/preview — renders the SAME tax-invoice PDF the send route attaches, returned
 * inline so the browser shows it in a tab. Nothing is sent or stored. Same-origin gated.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const clientName = typeof body?.clientName === 'string' ? body.clientName : ''
  const invoiceNumber = typeof body?.invoiceNumber === 'string' ? body.invoiceNumber.trim() : ''
  const description = typeof body?.description === 'string' ? body.description : undefined
  const projectAddress = typeof body?.projectAddress === 'string' ? body.projectAddress : undefined
  const comments = typeof body?.comments === 'string' ? body.comments : undefined
  const subtotalEx = Number(body?.subtotalEx)
  const gst = Number(body?.gst)
  const total = Number(body?.total)
  const lines = Array.isArray(body?.lines)
    ? (body.lines as unknown[])
        .map(l => (l && typeof l === 'object' ? l as { description?: unknown; amount?: unknown; claimedToDate?: unknown; remaining?: unknown } : null))
        .filter((l): l is { description?: unknown; amount?: unknown; claimedToDate?: unknown; remaining?: unknown } => !!l)
        .map(l => ({
          description: String(l.description ?? ''),
          amount: Number(l.amount),
          claimedToDate: Number.isFinite(Number(l.claimedToDate)) && l.claimedToDate !== undefined ? Number(l.claimedToDate) : undefined,
          remaining: Number.isFinite(Number(l.remaining)) && l.remaining !== undefined ? Number(l.remaining) : undefined,
        }))
        .filter(l => l.description && Number.isFinite(l.amount))
        .slice(0, 100)
    : []

  if (!invoiceNumber || lines.length === 0 ||
      !Number.isFinite(subtotalEx) || !Number.isFinite(gst) || !Number.isFinite(total)) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const buffer = await renderToBuffer(React.createElement(InvoicePdf, {
    inv: {
      invoiceNumber, description, clientName, projectAddress, lines, subtotalEx, gst, total, comments,
      invoiceDate: new Date().toISOString(),
    },
  }) as never)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceNumber.replace(/[^\w.-]+/g, '_')}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
