'use client'

import { useEffect, useState } from 'react'
import { loadProjects } from '@/lib/storage'
import type { Project } from '@/types'
import {
  getTrackingOptions,
  getXeroSyncStatus,
  triggerXeroSync,
  getProjectMapping,
  setProjectMapping,
  type TrackingCategory,
  type ProjectXeroMapping,
  type XeroSyncStatus,
} from '@/lib/xero'

/**
 * Settings panel: Project ↔ Xero tracking-option mapping + manual sync trigger.
 *
 * Only mounted when Xero is connected (settings/page.tsx guards on xeroConnected).
 * Within the panel we further guard: if Supabase service role isn't configured, the
 * panel shows a warning and disables the controls.
 */
export function XeroMappingSection() {
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<TrackingCategory[]>([])
  // Which Xero tracking category is the "Project" one. Defaults to anything named "Project".
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [mappings, setMappings] = useState<Map<string, ProjectXeroMapping | null>>(new Map())
  const [status, setStatus] = useState<XeroSyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)

  // Initial load: projects (local), tracking categories (Xero), per-project mappings, sync status
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const allProjects = loadProjects().filter(p => p.status !== 'complete')
      if (cancelled) return
      setProjects(allProjects)

      const [cats, syncStatus] = await Promise.all([
        getTrackingOptions(),
        getXeroSyncStatus(),
      ])
      if (cancelled) return
      setCategories(cats)
      setStatus(syncStatus)

      // Auto-pick the "Project" tracking category if it exists, else the first one
      const projectCat = cats.find(c => c.name.toLowerCase() === 'project') ?? cats[0]
      if (projectCat) setActiveCategoryId(projectCat.id)

      // Load every project's current mapping
      const entries = await Promise.all(
        allProjects.map(async p => [p.id, await getProjectMapping(p.id)] as const),
      )
      if (cancelled) return
      setMappings(new Map(entries))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const activeCategory = categories.find(c => c.id === activeCategoryId)

  const handleMappingChange = async (project: Project, optionId: string) => {
    if (!activeCategory) return
    if (!optionId) {
      // User picked "(unmapped)" — clear
      await setProjectMapping(project.id, null)
      setMappings(prev => new Map(prev).set(project.id, null))
      return
    }
    const option = activeCategory.options.find(o => o.id === optionId)
    if (!option) return
    const payload = {
      tracking_category_id: activeCategory.id,
      tracking_option_id: option.id,
      tracking_option_name: option.name,
    }
    await setProjectMapping(project.id, payload)
    setMappings(prev => new Map(prev).set(project.id, {
      project_id: project.id,
      ...payload,
      updated_at: new Date().toISOString(),
    }))
  }

  const handlePullNow = async () => {
    setSyncing(true)
    try {
      const result = await triggerXeroSync()
      // Refresh status to show the new run
      const newStatus = await getXeroSyncStatus()
      setStatus(newStatus)
      if (!result.ok && result.error) {
        window.alert(`Sync failed: ${result.error}`)
      }
    } finally {
      setSyncing(false)
    }
  }

  // No Supabase service-role configured → can't store mappings or run sync
  if (status && !status.configured) {
    return (
      <div className="bg-fg-bg border border-fg-border p-6 mb-8">
        <p className="text-xs font-light tracking-architectural uppercase text-fg-muted mb-3">Project ↔ Xero Mapping</p>
        <p className="text-sm font-light text-amber-600">
          Requires SUPABASE_SERVICE_ROLE_KEY env var on the server, plus migration <code>03-xero-live-jobs.sql</code> applied.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-fg-bg border border-fg-border p-6 mb-8">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-light tracking-architectural uppercase text-fg-muted mb-1">
            Project ↔ Xero Mapping
          </p>
          <p className="text-2xs text-fg-muted">
            Each project maps to one Xero tracking option. Costs tagged to that option appear on the
            project&apos;s Live Jobs row.
          </p>
        </div>
        <div className="text-right">
          <button
            onClick={handlePullNow}
            disabled={syncing}
            className="px-4 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-wide uppercase hover:bg-fg-darker transition-colors disabled:opacity-50"
          >
            {syncing ? 'Pulling…' : 'Pull now'}
          </button>
          <p className="text-2xs text-fg-muted mt-2">
            {status?.last_run
              ? `Last run: ${new Date(status.last_run.started_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}` +
                (status.last_run.bills_processed != null ? ` · ${status.last_run.bills_processed} bills` : '') +
                (status.last_run.status === 'error' ? ` · ERROR: ${status.last_run.error_message ?? 'unknown'}` : '')
              : 'No syncs yet'}
          </p>
        </div>
      </div>

      {/* Tracking category picker — usually one category, "Project", auto-selected */}
      {categories.length > 1 && (
        <div className="mb-4">
          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">
            Tracking Category
          </label>
          <select
            value={activeCategoryId || ''}
            onChange={e => setActiveCategoryId(e.target.value)}
            className="px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading"
          >
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-xs font-light text-fg-muted">Loading projects and Xero categories…</p>
      ) : !activeCategory ? (
        <p className="text-xs font-light text-amber-600">
          No tracking categories returned from Xero. Set one up in Xero (Settings → Tracking) then refresh.
        </p>
      ) : (
        <div className="border-t border-fg-border divide-y divide-fg-border/60">
          {projects.length === 0 && (
            <p className="text-xs font-light text-fg-muted py-4">No active projects to map.</p>
          )}
          {projects.map(p => {
            const mapping = mappings.get(p.id)
            return (
              <div key={p.id} className="grid grid-cols-3 items-center py-3 gap-3">
                <div className="col-span-1">
                  <p className="text-sm font-light text-fg-heading">{p.name}</p>
                  <p className="text-2xs text-fg-muted">{p.entity}</p>
                </div>
                <div className="col-span-1">
                  <select
                    value={mapping?.tracking_option_id || ''}
                    onChange={e => handleMappingChange(p, e.target.value)}
                    className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading"
                  >
                    <option value="">(unmapped)</option>
                    {activeCategory.options.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-1 text-right">
                  {mapping
                    ? <span className="text-2xs text-emerald-600">✓ Mapped to {mapping.tracking_option_name}</span>
                    : <span className="text-2xs text-amber-600">⚠ No costs will appear</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
