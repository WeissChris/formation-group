// Client helpers for the private 'attachments' Storage bucket. Files go to Storage (50MB each);
// the data stores keep only a small path string. See app/api/attachments/route.ts for the
// signed-URL broker. Generic: subbie quotes today, plan sets and site photos later.

import { supabase } from '@/lib/supabase'

/** Slug a filename into something path-safe while keeping the extension readable. */
export function safeFileName(name: string): string {
  return name.replace(/[^\w .()&+'-]+/g, '_').slice(-120) || 'file'
}

/** Upload a file to the attachments bucket at `path`. Returns the path, or null on failure. */
export async function uploadAttachment(path: string, file: File): Promise<string | null> {
  if (!supabase) return null
  const res = await fetch('/api/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) return null
  const { path: signedPath, token } = await res.json() as { path: string; token: string }
  const { error } = await supabase.storage.from('attachments').uploadToSignedUrl(signedPath, token, file)
  return error ? null : signedPath
}

/** A short-lived signed download URL for an attachment path, or null. */
export async function attachmentUrl(path: string): Promise<string | null> {
  const res = await fetch(`/api/attachments?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
  if (!res.ok) return null
  const { url } = await res.json() as { url: string }
  return url || null
}

/** Open/download an attachment in a new tab (signed URL). Returns false when unavailable. */
export async function openAttachment(path: string): Promise<boolean> {
  const url = await attachmentUrl(path)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export async function deleteAttachment(path: string): Promise<boolean> {
  const res = await fetch(`/api/attachments?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
  return res.ok
}

/** Decode a base64 data URI into a File (for migrating legacy embedded attachments). */
export function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  try {
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const contentType = /data:(.*?)(;base64)?$/.exec(dataUrl.slice(0, comma))?.[1] || 'application/octet-stream'
    const bin = atob(dataUrl.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new File([bytes], fileName, { type: contentType })
  } catch {
    return null
  }
}
