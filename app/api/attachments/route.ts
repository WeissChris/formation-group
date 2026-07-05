import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// File attachments live in the private 'attachments' Storage bucket (50MB/file) instead of as
// base64 blobs inside the data stores - embedded base64 was the main thing exhausting the ~5MB
// browser quota (subbie quote PDFs alone were most of fg_estimates). This route brokers signed
// upload and download URLs; the browser talks to Storage directly for the bytes. Generic on
// purpose: quotes today, large plan sets and site images later.

const BUCKET = 'attachments'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/** Storage object paths only: no traversal, no leading slash, sane charset per segment. */
function isSafePath(path: string): boolean {
  if (!path || path.length > 512 || path.startsWith('/') || path.includes('..')) return false
  return path.split('/').every(seg => seg.length > 0 && /^[\w .()&+'-]+$/.test(seg))
}

/** POST /api/attachments { path } -> a one-time signed upload URL token for that path. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const { path } = await request.json().catch(() => ({})) as { path?: string }
  if (!path || !isSafePath(path)) return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 })

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'sign_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, path: data.path, token: data.token })
}

/** GET /api/attachments?path=... -> a short-lived signed download URL. */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const path = new URL(request.url).searchParams.get('path') || ''
  if (!isSafePath(path)) return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 })

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'sign_failed' }, { status: 404 })
  return NextResponse.json({ ok: true, url: data.signedUrl })
}

/** DELETE /api/attachments?path=... */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const path = new URL(request.url).searchParams.get('path') || ''
  if (!isSafePath(path)) return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 })

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
