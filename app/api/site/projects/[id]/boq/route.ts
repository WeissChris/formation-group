import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'

export const runtime = 'nodejs'

/**
 * GET /api/site/projects/[id]/boq -> the accepted estimate row (raw snake_case) for the project's BOQ.
 * Prefers the accepted BASE estimate (not a variation); falls back to the latest version if none is
 * accepted yet. The /site BOQ tab maps it with the shared mapEstimate + estimateCalculations helpers,
 * so the figures match the office estimate exactly. Ownership enforced (project.foreman === session).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, params.id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })

  const { data } = await supabaseAdmin.from('fg_estimates').select('*').eq('project_id', params.id)
  const estimates = (data ?? []) as Record<string, unknown>[]
  const byVersionDesc = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    (Number(b.version) || 0) - (Number(a.version) || 0)
  const base = estimates.filter(e => !e.parent_estimate_id)
  const accepted = base.filter(e => e.status === 'accepted')
  const pick = [...(accepted.length ? accepted : base.length ? base : estimates)].sort(byVersionDesc)[0] ?? null

  return NextResponse.json({ ok: true, estimate: pick })
}
