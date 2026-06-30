'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import GanttPage from '@/app/projects/[id]/gantt/page'
import { mapProject, mapEstimate, mapGanttEntry, setGanttSiteMode } from '@/lib/storageAsync'
import { siteMe } from '@/lib/siteData'
import type { Project, Estimate, GanttEntry } from '@/types'

// The editable schedule = the EXACT office gantt, mounted inside the cockpit. We seed the foreman's
// localStorage from the server (the gantt reads localStorage), flip lib/storageAsync into site mode so
// its writes go to /api/site, then render the gantt. Best on a laptop/tablet — it's a dense grid.

function readArr<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as T[] } catch { return [] }
}
function writeArr(key: string, arr: unknown[]) {
  try { localStorage.setItem(key, JSON.stringify(arr)) } catch { /* quota — ignore */ }
}

export default function SiteSchedule({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const me = await siteMe()
      if (!me) { router.replace('/site'); return }
      const res = await fetch(`/api/site/projects/${params.id}/bootstrap`, { cache: 'no-store' })
      if (!res.ok) { if (active) setError('Could not load this project.'); return }
      const d = await res.json() as {
        project: Record<string, unknown>
        estimates: Record<string, unknown>[]
        gantt: Record<string, unknown>[]
        milestones: unknown[]
      }
      if (!active) return

      // Seed localStorage with the same shapes the office writes, merging by project so opening a second
      // project in the same session doesn't wipe the first.
      const project = mapProject(d.project)
      const estimates = d.estimates.map(mapEstimate)
      const entries = d.gantt.map(mapGanttEntry)

      writeArr('fg_projects', [...readArr<Project>('fg_projects').filter(p => p.id !== project.id), project])
      writeArr('fg_estimates', [...readArr<Estimate>('fg_estimates').filter(e => e.projectId !== project.id), ...estimates])
      writeArr('fg_gantt', [...readArr<GanttEntry>('fg_gantt').filter(g => g.projectId !== project.id), ...entries])
      try { localStorage.setItem(`fg_gantt_milestones_${project.id}`, JSON.stringify(d.milestones || [])) } catch { /* ignore */ }

      setGanttSiteMode(params.id)   // redirect the gantt's remote writes to /api/site
      if (active) setReady(true)
    })()
    return () => { active = false; setGanttSiteMode(null) }
  }, [params.id, router])

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-fg-muted">{error}</p>
      <Link href={`/site/${params.id}`} className="text-sm underline mt-3">Back to project</Link>
    </div>
  )
  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center text-sm text-fg-muted">Loading schedule...</div>
  )
  return (
    <div className="px-3 py-2">
      <GanttPage />
    </div>
  )
}
