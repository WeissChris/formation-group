import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { siteSessionFrom, loadOwnedProjectRow } from '@/lib/siteServer'

export const runtime = 'nodejs'

// Supplier quotes attached to a material line. Same shape as the Plans tab: a private bucket, one
// folder per project (then per material), uploads go straight to Storage via a short-lived SIGNED
// UPLOAD URL so big PDFs never hit Vercel's 4.5MB function-body limit, reads are 1-hour signed URLs.
// Deliberately NOT the shared 'attachments' route - that one is only same-origin gated, with no
// project-ownership check; everything under /api/site keeps the supervisor session + ownership gate.
const BUCKET = 'material-quotes'

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

/** GET ?path=projectId/materialId/name -> a 1-hour signed download URL for one quote. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad

  const path = new URL(request.url).searchParams.get('path') || ''
  if (!path.startsWith(`${params.id}/`)) return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 })
  const { data, error } = await supabaseAdmin!.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'sign_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, url: data.signedUrl })
}

/** POST { materialId, fileName } -> a signed upload URL the browser pushes the file bytes to. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad

  const body = await request.json().catch(() => ({})) as { materialId?: string; fileName?: string }
  const materialId = safeName(body.materialId || '')
  if (!body.materialId) return NextResponse.json({ ok: false, error: 'material_required' }, { status: 400 })
  const path = `${params.id}/${materialId}/${safeName(body.fileName || '')}`
  const { data, error } = await supabaseAdmin!.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message || 'sign_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, path: data.path, token: data.token })
}

/** DELETE ?path=projectId/materialId/name -> remove one quote (path stays inside the project). */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const bad = await guard(request, params.id)
  if (bad) return bad

  const path = new URL(request.url).searchParams.get('path') || ''
  if (!path.startsWith(`${params.id}/`)) return NextResponse.json({ ok: false, error: 'bad_path' }, { status: 400 })
  const { error } = await supabaseAdmin!.storage.from(BUCKET).remove([path])
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
