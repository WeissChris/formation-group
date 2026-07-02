'use client'

// Safety hub (office): the sites list + create-from-project. Each site = one physical address,
// one QR, one board; multiple projects (Formation and/or Lume) can share it.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { loadProjects } from '@/lib/storage'
import type { SafetySite } from '@/lib/safety'
import { SEVERITY_LABEL, type Incident } from '@/lib/safetyDocs'
import type { Project } from '@/types'

interface Links { projectId: string; name: string; entity: string; siteId: string }
type TriageIncident = Incident & { projectName: string }

export default function SafetyPage() {
  const [sites, setSites] = useState<SafetySite[] | null>(null)
  const [links, setLinks] = useState<Links[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [incidents, setIncidents] = useState<TriageIncident[]>([])
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => Promise.all([
    fetch('/api/safety/sites', { cache: 'no-store' }).then(r => r.json()),
    fetch('/api/safety/incidents', { cache: 'no-store' }).then(r => r.json()),
  ]).then(([d, inc]) => {
    if (d.ok) { setSites(d.sites); setLinks(d.links) } else setError('Could not load sites.')
    if (inc.ok) setIncidents(inc.incidents)
  })

  useEffect(() => {
    refresh()
    setProjects(loadProjects().filter(p => p.status !== 'complete' && p.status !== 'invoiced'))
  }, [])

  const triage = async (id: string, patch: { status?: string; worksafeNotified?: boolean }) => {
    await fetch('/api/safety/incidents', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    refresh()
  }

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
              <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-fg-card/20 transition-colors">
                <Link href={`/safety/sites/${s.id}`} className="min-w-0 flex-1">
                  <p className="text-sm text-fg-heading truncate">{s.address}</p>
                  <p className="text-xs text-fg-muted">
                    {s.shortRef} · {s.entity === 'lume' ? 'Lume Pools' : 'Formation'}
                    {siteProjects.length > 0 && <> · {siteProjects.map(p => p.name).join(' + ')}</>}
                  </p>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  {siteProjects.map(p => (
                    <Link key={p.projectId} href={`/safety/projects/${p.projectId}`}
                      className="text-xs underline text-fg-muted hover:text-fg-heading">Safety docs</Link>
                  ))}
                  <span className={`text-2xs uppercase tracking-wide ${s.status === 'active' ? 'text-green-600' : 'text-fg-muted'}`}>
                    {s.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Incident triage */}
      <div className="mt-12">
        <h2 className="text-sm font-medium text-fg-heading mb-3">
          Incidents {incidents.some(i => i.notifiable && !i.worksafeNotified && i.status === 'open') && (
            <span className="text-red-600 text-xs font-normal">- notifiable incident awaiting WorkSafe notification</span>
          )}
        </h2>
        {incidents.length === 0 ? (
          <p className="text-xs text-fg-muted">No incidents reported.</p>
        ) : (
          <div className="border border-fg-border divide-y divide-fg-border/60 bg-white">
            {incidents.map(i => (
              <div key={i.id} className={`px-4 py-3 ${i.notifiable && !i.worksafeNotified && i.status === 'open' ? 'bg-red-50' : ''}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-fg-heading truncate">{i.projectName}: {i.description.slice(0, 90)}</p>
                  <span className={`text-2xs uppercase tracking-wide shrink-0 ${i.severity === 'critical' || i.severity === 'serious' ? 'text-red-600' : 'text-fg-muted'}`}>
                    {SEVERITY_LABEL[i.severity]}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
                  <p className="text-2xs text-fg-muted">
                    {new Date(i.occurredAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    {i.reportedBy ? ` · ${i.reportedBy}` : ''}
                    {i.notifiable && <span className="text-red-600"> · WorkSafe notifiable{i.worksafeNotified ? ' (notified)' : ''}</span>}
                  </p>
                  <div className="flex gap-2">
                    {i.notifiable && !i.worksafeNotified && (
                      <button onClick={() => triage(i.id, { worksafeNotified: true })}
                        className="text-2xs uppercase tracking-wide text-red-600 underline">Mark WorkSafe notified</button>
                    )}
                    {i.status === 'open' ? (
                      <button onClick={() => triage(i.id, { status: 'closed' })}
                        className="text-2xs uppercase tracking-wide text-fg-muted underline">Close</button>
                    ) : (
                      <span className="text-2xs uppercase tracking-wide text-fg-muted/60">closed</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
