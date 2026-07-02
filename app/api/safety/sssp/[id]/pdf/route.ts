import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mapSssp } from '@/lib/safetyDocs'
import { SSSP_SCHEMAS } from '@/lib/safetyContent'
import { SsspPdf } from '@/lib/safetyDocsPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET /api/safety/sssp/[id]/pdf -> the A4 SSSP for a saved version. UUID-keyed. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const { data: row } = await supabaseAdmin.from('sf_sssps').select('*').eq('id', params.id).maybeSingle()
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  const sssp = mapSssp(row)
  const schema = SSSP_SCHEMAS[sssp.schemaKey] || SSSP_SCHEMAS.formation

  const { data: proj } = await supabaseAdmin.from('fg_projects')
    .select('name, address').eq('id', sssp.projectId).maybeSingle()

  const buffer = await renderToBuffer(React.createElement(SsspPdf, {
    sssp, schema,
    projectName: (proj?.name as string) || '',
    address: (proj?.address as string) || '',
  }) as never)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="sssp-v${sssp.version}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
