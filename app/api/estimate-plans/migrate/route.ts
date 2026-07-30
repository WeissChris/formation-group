import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Convert-to-project hands the estimate's plan folder to the new project: every object under
// project-plans/<family id>/ moves to <project id>/, which is the folder the foreman cockpit's
// Plans tab lists. Idempotent enough for a retry (moved files are no longer in the source list);
// a name collision in the target keeps the source file in place and is reported.
const BUCKET = 'project-plans'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

const isSafeFolder = (f: string) => !!f && f.length <= 100 && /^[\w-]+$/.test(f)

/** POST { fromFolder, toFolder } -> moves every plan file across; returns moved/failed counts. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const body = await request.json().catch(() => ({})) as { fromFolder?: string; toFolder?: string }
  const from = body.fromFolder || '', to = body.toFolder || ''
  if (!isSafeFolder(from) || !isSafeFolder(to) || from === to) {
    return NextResponse.json({ ok: false, error: 'bad_folder' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(from, { limit: 500 })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  let moved = 0
  const failed: string[] = []
  for (const o of (data ?? []).filter(o => o.id && o.name)) {
    const { error: mvErr } = await supabaseAdmin.storage.from(BUCKET).move(`${from}/${o.name}`, `${to}/${o.name}`)
    if (mvErr) failed.push(o.name); else moved++
  }
  return NextResponse.json({ ok: failed.length === 0, moved, failed })
}
