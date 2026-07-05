import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { emptyHandoverData, type HandoverData } from '@/lib/handoverChecklist'
import { HandoverPdf } from '@/lib/handoverPdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET /api/handover/[id]/pdf -> the A4 pre-handover walkthrough for project [id].
 *  UUID-keyed, no auth gate (the SWMS-PDF pattern) - the document goes into the client
 *  handover pack and contains no financials. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const [projRes, checkRes] = await Promise.all([
    supabaseAdmin.from('fg_projects').select('name, address, foreman').eq('id', params.id).maybeSingle(),
    supabaseAdmin.from('fg_handover_checklists').select('*').eq('project_id', params.id).maybeSingle(),
  ])
  if (!projRes.data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  const row = checkRes.data
  const d = (row?.data as Partial<HandoverData>) || {}
  const checklist = {
    data: {
      items: d.items && typeof d.items === 'object' ? d.items : {},
      subbieTasks: Array.isArray(d.subbieTasks) ? d.subbieTasks : [],
      plantLog: Array.isArray(d.plantLog) ? d.plantLog : [],
    } as HandoverData,
    signedOffBy: (row?.signed_off_by as string | null) ?? null,
    signedOffAt: (row?.signed_off_at as string | null) ?? null,
    updatedAt: (row?.updated_at as string | undefined) ?? undefined,
  }
  if (!row) checklist.data = emptyHandoverData()

  const projectName = (projRes.data.name as string) || ''
  const buffer = await renderToBuffer(React.createElement(HandoverPdf, {
    checklist,
    projectName,
    address: (projRes.data.address as string) || '',
    supervisor: (projRes.data.foreman as string) || '',
  }) as never)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="handover-${projectName.replace(/[^\w]+/g, '-').toLowerCase() || 'walkthrough'}.pdf"`,
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
