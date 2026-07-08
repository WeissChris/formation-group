// Safety-net pass for progress snapshots: capture one for any live job that hasn't been snapshotted
// in ~3 weeks, so a job that invoices rarely still builds a creep trend. Runs from the hourly cron's
// 'extras' task; invoice sends capture on their own. Append-only, same-day de-duped in captureSnapshot.

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { captureSnapshot } from '@/lib/captureSnapshot'
import { shouldAutoSnapshot, type ProgressSnapshot } from '@/lib/progressSnapshot'

export async function runProgressSnapshots(now = new Date()): Promise<{
  ok: boolean; checked: number; captured: number; error?: string
}> {
  if (!supabaseAdmin) return { ok: false, checked: 0, captured: 0, error: 'supabase_admin_not_configured' }

  // Live jobs only: on-site stages, not closed.
  const { data: projRows } = await supabaseAdmin.from('fg_projects')
    .select('id')
    .in('stage', ['active', 'completion', 'handover'])
    .not('status', 'in', '("complete","invoiced")')
  const projects = (projRows ?? []) as { id: string }[]

  let captured = 0
  for (const p of projects) {
    const { data } = await supabaseAdmin.from('fg_progress_snapshots').select('snapshots').eq('project_id', p.id).maybeSingle()
    const existing = (Array.isArray(data?.snapshots) ? data!.snapshots : []) as ProgressSnapshot[]
    if (!shouldAutoSnapshot(existing, now)) continue
    const r = await captureSnapshot(p.id, 'auto', now)
    if (r.captured) captured++
  }
  return { ok: true, checked: projects.length, captured }
}
