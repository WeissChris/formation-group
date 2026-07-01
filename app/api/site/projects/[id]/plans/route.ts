import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'

export const runtime = 'nodejs'

// Plan drawings/specs live in a private Supabase Storage bucket, one folder per project. The foreman
// uploads straight to Storage via a short-lived SIGNED UPLOAD URL this route mints (so large PDFs never
// hit Vercel's 4.5MB function-body limit and never bloat the DB). Reads are short-lived signed URLs too.
// Everything is gated by the supervisor session + project ownership, same as the rest of /api/site.
const BUCKET = 'project-plans'

/** Keep a filename human-readable but safe as an object key. */
function safeName(name: string): string {
  return (name || 'file').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'file'
}

/** Ownership gate shared by every verb. Returns an error response to bail with, or null to proceed. */
async function guard(request: NextRequest, id: string): Promise<NextResponse | null> {
  const session = siteSessionFrom(request)
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const project = await loadOwnedProjectRow(session, id)
  if (!project) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  if (!supabaseAdmin) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 })
  return null
}

/** GET -> the project's plan files with a 1-hour signed download URL each. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad

  const { data, error } = await supabaseAdmin!.storage.from(BUCKET).list(params.id, {
    limit: 500, sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const files = await Promise.all((data ?? [])
    .filter(o => o.id && o.name)   // skip folder placeholders
    .map(async o => {
      const path = `${params.id}/${o.name}`
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

/** POST { fileName } -> a signed upload URL the browser uploads the file bytes to directly. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad

  const body = await request.json().catch(() => ({})) as { fileName?: string }
  const path = `${params.id}/${safeName(body.fileName || '')}`
  const { data, error } = await supabaseAdmin!.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'sign_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, path: data.path, token: data.token })
}

/** DELETE ?path=projectId/name -> remove one plan file (path must stay inside the project's folder). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad

  const path = new URL(request.url).searchParams.get('path') || ''
  if (!path.startsWith(`${params.id}/`)) return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 })
  const { error } = await supabaseAdmin!.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
