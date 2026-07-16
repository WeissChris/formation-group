import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Manage the shared proposal sample-package library (our generic 2D / 3D example PDFs). The office
// uploads straight to the public `proposal-samples` bucket via a signed upload URL minted here, so a
// 30MB PDF never passes through the function body. Same-origin gated (the app is password-gated).

const BUCKET = 'proposal-samples'

function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get('host')
  if (!host) return false
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  if (origin) { try { return new URL(origin).host === host } catch { return false } }
  if (referer) { try { return new URL(referer).host === host } catch { return false } }
  return false
}

/** Keep a filename human-readable but safe as an object key. */
function safeName(name: string): string {
  return (name || 'sample.pdf').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'sample.pdf'
}

/**
 * POST { action: 'uploadUrl', fileName }        -> { id, path, token } for a direct Storage upload
 * POST { id, title, blurb, path, fileName, sizeBytes } -> save/replace the library row
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const body = await request.json().catch(() => ({})) as {
    action?: string; id?: string; title?: string; blurb?: string; path?: string; fileName?: string; sizeBytes?: number
  }

  if (body.action === 'uploadUrl') {
    const id = `sample-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const path = `${id}/${safeName(body.fileName || '')}`
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'sign_failed' }, { status: 500 })
    return NextResponse.json({ ok: true, id, path: data.path, token: data.token })
  }

  const title = (body.title || '').trim()
  if (!body.id || !body.path || !title) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })
  const row = {
    id: body.id,
    title: title.slice(0, 120),
    blurb: (body.blurb || '').trim().slice(0, 240) || null,
    path: body.path,
    file_name: body.fileName ?? null,
    size_bytes: Number(body.sizeBytes) || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabaseAdmin.from('fg_proposal_samples').upsert(row)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** DELETE ?id= -> drop the library row and its file. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })

  const { data } = await supabaseAdmin.from('fg_proposal_samples').select('path').eq('id', id).maybeSingle()
  if (data?.path) await supabaseAdmin.storage.from(BUCKET).remove([data.path as string])
  const { error } = await supabaseAdmin.from('fg_proposal_samples').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
