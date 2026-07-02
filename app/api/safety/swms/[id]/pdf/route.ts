import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapSwms, mapSwmsAck } from '@/lib/safetyDocs'
import { SwmsPdf } from '@/lib/safetyDocsPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET /api/safety/swms/[id]/pdf -> the A4 SWMS document (incl. acknowledgements).
 *  UUID-keyed, no auth gate - the SWMS is handed to subbies on site by design. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const { data: row } = await supabaseAdmin.from('sf_swms').select('*').eq('id', params.id).maybeSingle()
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  const swms = mapSwms(row)

  const [ackRes, projRes] = await Promise.all([
    supabaseAdmin.from('sf_swms_acks').select('*').eq('swms_id', params.id).order('accepted_at', { ascending: true }),
    supabaseAdmin.from('fg_projects').select('name, entity, address').eq('id', swms.projectId).maybeSingle(),
  ])
  const acks = (ackRes.data ?? []).map(mapSwmsAck)
  const entity = (projRes.data?.entity as string) === 'lume' ? 'lume' as const : 'formation' as const

  const buffer = await renderToBuffer(React.createElement(SwmsPdf, {
    swms, acks,
    projectName: (projRes.data?.name as string) || '',
    entity,
    address: (projRes.data?.address as string) || '',
  }) as never)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="swms-${swms.activityName.replace(/[^\w]+/g, '-').toLowerCase()}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
