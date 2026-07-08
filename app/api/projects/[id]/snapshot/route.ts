import { NextRequest, NextResponse } from 'next/server'
import { captureSnapshot } from '@/lib/captureSnapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/projects/[id]/snapshot?trigger=invoice|active
// Captures one progress snapshot for the project (creep vs the frozen original baseline + usage vs
// budget). Fired by the office app when an invoice is sent or a job goes Active - same-origin only.

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  const t = new URL(request.url).searchParams.get('trigger')
  const trigger = t === 'active' ? 'active' : 'invoice'
  const result = await captureSnapshot(params.id, trigger)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
