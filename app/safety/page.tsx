'use client'

// Safety hub (office): the sites list + create-from-project. Each site = one physical address,
// one QR, one board; multiple projects (Formation and/or Lume) can share it.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { loadProjects } from '@/lib/storage'
import type { SafetySite } from '@/lib/safety'
import type { Project } from '@/types'

interface Links { projectId: string; name: string; entity: string; siteId: string }

export default function SafetyPage() {
  const [sites, setSites] = useState<SafetySite[] | null>(null)
  const [links, setLinks] = useState<Links[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => fetch('/api/safety/sites', { cache: 'no-store' })
    .then(r => r.json())
    .then(d => { if (d.ok) { setSites(d.sites); setLinks(d.links) } else setError('Could not load sites.') })

  useEffect(() => {
    refresh()
    setProjects(loadProjects().filter(p => p.status !== 'complete' && p.status !== 'invoiced'))
  }, [])

  const linkedProjectIds = useMemo(() => new Set(links.map(l => l.projectId)), [links])
  const unlinked = projects.filter(p => !linkedProjectIds.has(p.id))

  const createFromProject = async () => {
    if (!pick) return
    setBusy(true); setError('')
    const res = await fetch('/api/safety/sites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: pick }),
    })
    setBusy(false)
    if (res.ok) { setPick(''); refresh() }
    else setError('Could not create the site.')
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-24 pb-16">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">Safety</h1>
          <p className="text-sm font-light text-fg-muted mt-1">Sites, boards, sign-in registers - one QR per address.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={pick} onChange={e => setPick(e.target.value)}
            className="border border-fg-border px-3 py-2 text-xs bg-white min-w-[260px]">
            <option value="">Create a site from a project...</option>
            {unlinked.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={createFromProject} disabled={!pick || busy}
            className="px-4 py-2 bg-fg-dark text-white text-xs font-light tracking-wide uppercase disabled:opacity-40">
            {busy ? 'Creating...' : 'Create site'}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mb-4">{error}</p>}

      {sites === null ? (
        <p className="text-sm text-fg-muted">Loading...</p>
      ) : sites.length === 0 ? (
        <p className="text-sm text-fg-muted py-10 text-center border border-dashed border-fg-border">
          No safety sites yet. Create one from a project to get its board + QR sign-in.
        </p>
      ) : (
        <div className="border border-fg-border divide-y divide-fg-border/60 bg-white">
          {sites.map(s => {
            const siteProjects = links.filter(l => l.siteId === s.id)
            return (
              <Link key={s.id} href={`/safety/sites/${s.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-fg-card/20 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm text-fg-heading truncate">{s.address}</p>
                  <p className="text-xs text-fg-muted">
                    {s.shortRef} · {s.entity === 'lume' ? 'Lume Pools' : 'Formation'}
                    {siteProjects.length > 0 && <> · {siteProjects.map(p => p.name).join(' + ')}</>}
                  </p>
                </div>
                <span className={`text-2xs uppercase tracking-wide shrink-0 ${s.status === 'active' ? 'text-green-600' : 'text-fg-muted'}`}>
                  {s.status}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
