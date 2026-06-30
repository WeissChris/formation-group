import { NextRequest, NextResponse } from 'next/server'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'

export const runtime = 'nodejs'

/** GET /api/site/projects/[id] -> the project (incl. client + site details) IF it belongs to the supervisor. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const row = await loadOwnedProjectRow(session, params.id)
  if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    project: {
      id: row.id as string,
      name: row.name as string,
      address: (row.address as string) || '',
      clientName: (row.client_name as string) || '',
      clientPhone: (row.client_phone as string | null) || '',
      clientEmail: (row.client_email as string | null) || '',
      siteAccessNotes: (row.site_access_notes as string | null) || '',
      status: row.status as string,
      stage: (row.stage as string) || null,
      startDate: (row.start_date as string) || '',
      plannedCompletion: (row.planned_completion as string) || '',
      crewSize: row.crew_size != null ? Number(row.crew_size) : null,
      foreman: (row.foreman as string) || '',
    },
  })
}
