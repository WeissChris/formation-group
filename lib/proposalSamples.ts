// Sample design packages attached to design proposals (our generic 2D / 3D example PDFs).
//
// These are the SAME files for every client, so they live once in the public `proposal-samples`
// bucket and each proposal ticks which to show. Public URLs never expire (unlike a WeTransfer link)
// and cost nothing per proposal. Files are pushed straight to Storage via a signed upload URL, so a
// 30MB PDF never hits Vercel's 4.5MB function-body limit.

import { supabase, isSupabaseConfigured } from './supabase'

const BUCKET = 'proposal-samples'

export interface ProposalSample {
  id: string
  title: string          // client-facing name, e.g. "2D Design Package"
  blurb?: string         // one-line description under the title
  path: string           // object key in the bucket
  fileName?: string
  sizeBytes?: number
  sort: number
}

/** Permanent public URL for a sample (the bucket is public - no signing, no expiry). */
export function sampleUrl(path: string): string {
  if (!supabase || !isSupabaseConfigured()) return ''
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Human file size for the "View sample" card, so a client knows what they're opening. */
export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function mapSampleRow(row: Record<string, unknown>): ProposalSample {
  return {
    id: row.id as string,
    title: (row.title as string) || '',
    blurb: (row.blurb as string | null) || undefined,
    path: (row.path as string) || '',
    fileName: (row.file_name as string | null) || undefined,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : undefined,
    sort: Number(row.sort) || 0,
  }
}

/** The shared library, ordered. Readable by the office AND the public proposal page. */
export async function getProposalSamples(): Promise<ProposalSample[]> {
  if (!supabase || !isSupabaseConfigured()) return []
  const { data, error } = await supabase.from('fg_proposal_samples').select('*').order('sort').order('title')
  if (error || !data) return []
  return data.map(mapSampleRow)
}

/** Upload a sample PDF straight to Storage (signed URL minted server-side), then save its row. */
export async function uploadProposalSample(file: File, title: string, blurb: string): Promise<boolean> {
  if (!supabase) return false
  const res = await fetch('/api/proposal-samples', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'uploadUrl', fileName: file.name }),
  })
  if (!res.ok) return false
  const { id, path, token } = await res.json() as { id: string; path: string; token: string }
  const up = await supabase.storage.from(BUCKET).uploadToSignedUrl(path, token, file, { contentType: file.type || 'application/pdf', upsert: true })
  if (up.error) return false
  const save = await fetch('/api/proposal-samples', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, blurb, path, fileName: file.name, sizeBytes: file.size }),
  })
  return save.ok
}

export async function deleteProposalSample(id: string): Promise<boolean> {
  const res = await fetch(`/api/proposal-samples?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  return res.ok
}
