import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendInvoiceOpenedNotification } from '@/lib/email'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 1x1 transparent GIF.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

const pixelResponse = () =>
  new NextResponse(new Uint8Array(PIXEL), {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Content-Length': String(PIXEL.length) },
  })

/**
 * GET /api/claims/opened?cid=<claimId> — the invoice email's tracking pixel. Public by necessity
 * (email clients fetch it); it only ever records "this claim's email was opened". The first open
 * also emails the office a read notification, with the claim details looked up server-side (the
 * URL carries nothing but the id). Always answers with the pixel, whatever happens.
 */
export async function GET(request: NextRequest) {
  const cid = (request.nextUrl.searchParams.get('cid') || '').trim()
  if (!cid || cid.length > 80 || !supabaseAdmin) return pixelResponse()
  const rl = rateLimit(`open:${clientIp(request)}`, 60, 10 * 60_000)
  if (!rl.allowed) return pixelResponse()

  try {
    // Only real claims are recorded - an invented cid does nothing.
    const { data: claimRow } = await supabaseAdmin.from('fg_progress_claims').select('id, project_id, data').eq('id', cid).maybeSingle()
    if (!claimRow) return pixelResponse()

    const { data: existing } = await supabaseAdmin.from('fg_claim_opens').select('claim_id, open_count').eq('claim_id', cid).maybeSingle()
    if (existing) {
      await supabaseAdmin.from('fg_claim_opens')
        .update({ last_opened_at: new Date().toISOString(), open_count: (existing.open_count ?? 1) + 1 })
        .eq('claim_id', cid)
      return pixelResponse()
    }

    await supabaseAdmin.from('fg_claim_opens').insert({ claim_id: cid, project_id: claimRow.project_id })

    // First open -> tell the office. Details come from the stored claim, not the URL.
    const claim = (claimRow.data ?? {}) as { invoiceNumber?: string; total?: number }
    let projectName = ''
    if (claimRow.project_id) {
      const { data: proj } = await supabaseAdmin.from('fg_projects').select('name').eq('id', claimRow.project_id).maybeSingle()
      projectName = (proj?.name as string) ?? ''
    }
    void sendInvoiceOpenedNotification({
      invoiceNumber: claim.invoiceNumber || cid.slice(0, 8),
      projectName,
      total: typeof claim.total === 'number' ? claim.total : undefined,
    })
  } catch {
    /* the pixel must never fail the email render */
  }
  return pixelResponse()
}
