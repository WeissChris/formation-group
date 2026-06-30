import { NextRequest, NextResponse } from 'next/server'
import { siteSessionFrom } from '@/lib/siteServer'

export const runtime = 'nodejs'

/** GET /api/site/me -> { supervisorId, name } if a valid supervisor session, else 401. */
export async function GET(request: NextRequest) {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true, supervisorId: session.sub, name: session.name })
}
