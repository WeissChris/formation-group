import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Plans uploaded at ESTIMATE stage, so the drawing set is on the job before it is won. They live
// in the same private 'project-plans' bucket the foreman cockpit reads, under a folder keyed by
// the estimate's version family (v1/v2/v3 share one set); winning the job moves the folder to the
// project id (see ./migrate), at which point the cockpit Plans tab sees them with no extra step.
// Office-side twin of /api/site/projects/[id]/plans: same-origin gated like /api/attachments
// (the office app has no server session), signed URLs broker the bytes.
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

/** Folder = an estimate/family/project id: one path segment, sane charset, no traversal. */
function isSafeFolder(folder: string): boolean {
  return !!folder && folder.length <= 100 && /^[\w-]+$/.test(folder)
}

/** Keep a filename human-readable but safe as an object key. */
function safeName(name: string): string {
  return (name || 'file').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'file'
}

/** GET ?folder= -> the folder's plan files with a 1-hour signed download URL each. */
export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const folder = new URL(request.url).searchParams.get('folder') || ''
  if (!isSafeFolder(folder)) return NextResponse.json({ ok: false, error: 'bad_folder' }, { status: 400 })

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(folder, {
    limit: 500, sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const files = await Promise.all((data ?? [])
    .filter(o => o.id && o.name)   // skip folder placeholders
    .map(async o => {
      const path = `${folder}/${o.name}`
      const signed = await supabaseAdmin!.storage.from(BUCKET).createSignedUrl(path, 3600)
      return {
        name: o.name,
        path,
        size: Number((o.metadata as { size?: number } | null)?.size ?? 0),
        updatedAt: (o.updated_at as string) || (o.created_at as string) || '',
        url: signed.data?.signedUrl ?? '',
      }
    }))
  return NextResponse.json({ ok: true, files })
}

/** POST { folder, fileName } -> a signed upload URL the browser pushes the file bytes to. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const body = await request.json().catch(() => ({})) as { folder?: string; fileName?: string }
  const folder = body.folder || ''
  if (!isSafeFolder(folder)) return NextResponse.json({ ok: false, error: 'bad_folder' }, { status: 400 })

  const path = `${folder}/${safeName(body.fileName || '')}`
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'sign_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, path: data.path, token: data.token })
}

/** DELETE ?path=folder/name -> remove one plan file. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  const path = new URL(request.url).searchParams.get('path') || ''
  const parts = path.split('/')
  if (parts.length !== 2 || !isSafeFolder(parts[0]) || !parts[1]) {
    return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
