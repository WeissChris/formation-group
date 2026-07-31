import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Same-origin gate — matches the other internal routes. */
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
 * GET /api/claims/opens?projectId=<id> — read receipts for a project's invoice emails, keyed by
 * claim id. Feeds the "read" chip on the invoicing tab. Same-origin gated.
 */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  const projectId = (request.nextUrl.searchParams.get('projectId') || '').trim()
  if (!projectId || !supabaseAdmin) return NextResponse.json({ ok: true, opens: {} })

  const { data } = await supabaseAdmin
    .from('fg_claim_opens')
    .select('claim_id, first_opened_at, last_opened_at, open_count')
    .eq('project_id', projectId)
  const opens: Record<string, { first: string; last: string; count: number }> = {}
  for (const row of data ?? []) {
    opens[row.claim_id as string] = {
      first: row.first_opened_at as string,
      last: row.last_opened_at as string,
      count: (row.open_count as number) ?? 1,
    }
  }
  return NextResponse.json({ ok: true, opens })
}
