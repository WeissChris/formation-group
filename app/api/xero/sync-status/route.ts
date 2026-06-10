import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
// No request input → would be statically cached and serve a stale "last synced" forever.
export const dynamic = 'force-dynamic'

/**
 * GET /api/xero/sync-status
 *
 * Returns the most recent pull-run row, plus the count of mapped projects, so the
 * dashboard can render "Last synced 14 min ago · 47 bills processed".
 */
export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ configured: false })
  }
  const [{ data: lastRun }, { count: mappedCount }] = await Promise.all([
    supabaseAdmin
      .from('fg_xero_pull_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('fg_project_xero_mapping')
      .select('project_id', { count: 'exact', head: true }),
  ])
  return NextResponse.json({
    configured: true,
    mapped_project_count: mappedCount ?? 0,
    last_run: lastRun || null,
  })
}
