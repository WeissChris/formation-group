// Office-side client for plans attached at estimate stage (private 'project-plans' bucket,
// brokered by /api/estimate-plans). The folder is the estimate's VERSION FAMILY anchor id -
// versionGroupIdOf(estimate) - so v1/v2/v3 of a quote share one drawing set; after conversion the
// folder is the project id (the migrate call moves it), which is what the foreman cockpit lists.

import { supabase } from './supabase'

export interface EstimatePlan { name: string; path: string; size: number; updatedAt: string; url: string }

/** The Storage folder an estimate's plans live in: the project once converted, else the family. */
export function planFolderOf(est: { projectId?: string; versionGroupId?: string; id: string }): string {
  return est.projectId || est.versionGroupId || est.id
}

export async function getEstimatePlans(folder: string): Promise<EstimatePlan[]> {
  try {
    const res = await fetch(`/api/estimate-plans?folder=${encodeURIComponent(folder)}`)
    if (!res.ok) return []
    const d = await res.json() as { ok: boolean; files: EstimatePlan[] }
    return d.ok ? d.files : []
  } catch { return [] }
}

/** Mint a signed upload URL server-side, then push the bytes straight to Storage (mirrors the
 *  cockpit's uploadSitePlan - big plan sets never touch the Vercel body limit). */
export async function uploadEstimatePlan(folder: string, file: File): Promise<boolean> {
  if (!supabase) return false
  const res = await fetch('/api/estimate-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, fileName: file.name }),
  })
  if (!res.ok) return false
  const { path, token } = await res.json() as { path: string; token: string }
  const { error } = await supabase.storage.from('project-plans').uploadToSignedUrl(path, token, file)
  return !error
}

export async function deleteEstimatePlan(path: string): Promise<boolean> {
  const res = await fetch(`/api/estimate-plans?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
  return res.ok
}

/** Hand the family's plan folder to the newly created project. Returns false when any file
 *  failed to move (the caller should tell the user rather than silently losing drawings). */
export async function migrateEstimatePlans(fromFolder: string, toProjectId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/estimate-plans/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromFolder, toFolder: toProjectId }),
    })
    if (!res.ok) return false
    const d = await res.json() as { ok: boolean }
    return d.ok
  } catch { return false }
}
