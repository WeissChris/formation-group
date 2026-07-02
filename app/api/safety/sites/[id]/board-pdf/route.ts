import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapSafetySite, mapSiteBoard, DEFAULT_BOARD_HAZARDS } from '@/lib/safety'
import { SiteBoardPdf } from '@/lib/safetyBoardPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/safety/sites/[id]/board-pdf -> the 600x900mm printable site board.
 * Regenerated per request (no storage) so board edits show up immediately. The board is
 * literally displayed on a fence - its content is public by nature, so no auth gate; the
 * URL still requires knowing the site UUID.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const [siteRes, boardRes] = await Promise.all([
    supabaseAdmin.from('sf_sites').select('*').eq('id', params.id).maybeSingle(),
    supabaseAdmin.from('sf_site_boards').select('*').eq('site_id', params.id).maybeSingle(),
  ])
  if (!siteRes.data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  const site = mapSafetySite(siteRes.data)
  const board = boardRes.data
    ? mapSiteBoard(boardRes.data)
    : { ...mapSiteBoard({ site_id: site.id }), hazards: DEFAULT_BOARD_HAZARDS }
  if (board.hazards.length === 0) board.hazards = DEFAULT_BOARD_HAZARDS

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://formation-group.vercel.app').replace(/\/$/, '')
  const qrDataUrl = await QRCode.toDataURL(`${appUrl}/signin/${site.shortRef}`, {
    errorCorrectionLevel: 'M', margin: 1, width: 1200,
  })

  const buffer = await renderToBuffer(React.createElement(SiteBoardPdf, { site, board, qrDataUrl }) as never)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="site-board-${site.shortRef}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
