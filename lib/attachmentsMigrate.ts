// One-time client-side migration: move legacy base64 quote attachments out of the estimate and
// subbie-package blobs into the private 'attachments' Storage bucket. Embedded base64 quotes were
// the bulk of fg_estimates/fg_subcontractors and the main cause of the browser-quota exhaustion
// that silently lost estimate edits.
//
// Idempotent: only rows still carrying quoteFileData are touched, so a rerun after a failed
// upload picks up where it left off. The done-flag is only set once nothing is left to migrate.
// Runs per browser (LoginGate schedules it after auth) - each device migrates whatever legacy
// base64 its own store still holds; newest-wins sync converges the copies.

import { loadEstimates, loadSubcontractors } from './storage'
import { upsertEstimate, upsertSubcontractor } from './storageAsync'
import { uploadAttachment, safeFileName, dataUrlToFile } from './attachments'

const DONE_FLAG = 'fg_attachments_migrated_v1'

export async function migrateEmbeddedAttachments(): Promise<void> {
  if (typeof window === 'undefined') return
  try { if (localStorage.getItem(DONE_FLAG)) return } catch { return }
  let allDone = true

  for (const est of loadEstimates()) {
    if (!(est.lineItems || []).some(i => i.quoteFileData)) continue
    let changed = false
    const nextItems = []
    for (const i of est.lineItems) {
      if (!i.quoteFileData) { nextItems.push(i); continue }
      const file = dataUrlToFile(i.quoteFileData, i.quoteFileName || 'quote')
      const path = file
        ? await uploadAttachment(`estimates/${est.id}/${i.id}/${safeFileName(i.quoteFileName || 'quote')}`, file)
        : null
      if (path) { nextItems.push({ ...i, quoteFilePath: path, quoteFileData: undefined }); changed = true }
      else { nextItems.push(i); allDone = false }
    }
    if (changed) {
      await upsertEstimate({ ...est, lineItems: nextItems, updatedAt: new Date().toISOString() })
      console.log(`[attachments] migrated embedded quotes on estimate ${est.name || est.id}`)
    }
  }

  for (const pkg of loadSubcontractors()) {
    if (!pkg.quoteFileData) continue
    const file = dataUrlToFile(pkg.quoteFileData, pkg.quoteFileName || 'quote')
    const path = file
      ? await uploadAttachment(`subbies/${pkg.projectId}/${pkg.id}/${safeFileName(pkg.quoteFileName || 'quote')}`, file)
      : null
    if (path) {
      await upsertSubcontractor({ ...pkg, quoteFilePath: path, quoteFileData: undefined, updatedAt: new Date().toISOString() })
      console.log(`[attachments] migrated embedded quote on subbie package ${pkg.name || pkg.id}`)
    } else {
      allDone = false
    }
  }

  if (allDone) {
    try { localStorage.setItem(DONE_FLAG, '1') } catch { /* ignore */ }
    console.log('[attachments] embedded-attachment migration complete')
  }
}
