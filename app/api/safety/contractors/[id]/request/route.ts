import { NextRequest, NextResponse } from 'next/server'
import { requestDocsForCompany } from '@/lib/safetyChase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/** POST /api/safety/contractors/[id]/request { docTypes? } -> email the company an upload link
 *  for the given (or currently-needed) documents. dryRun true = no RESEND_API_KEY yet. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  const body = await request.json().catch(() => ({})) as { docTypes?: string[] }
  const result = await requestDocsForCompany(params.id, body.docTypes)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
