import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'
import type { SubcontractorPackage } from '@/types'

export const runtime = 'nodejs'

/** GET /api/site/projects/[id]/subbies -> the project's subcontractor packages incl. quote files. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const owned = await loadOwnedProjectRow(session, params.id)
  if (!owned) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: true, subbies: [] })

  const { data } = await supabaseAdmin
    .from('fg_subcontractors')
    .select('data')
    .eq('project_id', params.id)
  const subbies = (data || []).map(r => r.data as SubcontractorPackage)
  return NextResponse.json({ ok: true, subbies })
}
