'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { loadProjects } from '@/lib/storage'
import { STAGE_LABELS, STAGE_COLOURS } from '@/lib/stageConfig'
import { scheduleStatus, healthColour, healthBg } from '@/lib/projectHealth'
import type { ProjectStage } from '@/types'
import { formatCurrency } from '@/lib/utils'
import type { Project, EntityType } from '@/types'
import EntityBadge from '@/components/EntityBadge'
import { Plus, Search, FolderOpen } from 'lucide-react'
import { Suspense } from 'react'

function formatProjectDate(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusPill({ status }: { status: Project['status'] }) {
  const map: Record<Project['status'], string> = {
    planning: 'Planning',
    active:   'Active',
    complete: 'Complete',
    invoiced: 'Invoiced',
  }
  return (
    <span className="text-2xs font-light tracking-wide uppercase text-fg-muted border border-fg-border rounded-sm px-1.5 py-0.5">
      {map[status]}
    </span>
  )
}

function ProjectsInner() {
  const searchParams = useSearchParams()
  const entityParam = searchParams.get('entity') as EntityType | null

  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<EntityType | 'all'>(entityParam ?? 'all')

  useEffect(() => {
    setProjects(loadProjects())
  }, [])

  const filtered = projects
    .filter(p => entityFilter === 'all' || p.entity === entityFilter)
    .filter(p => {
      const q = search.toLowerCase()
      return !q || p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
    })

  const tabs: { label: string; value: EntityType | 'all' }[] = [
    { label: 'All',       value: 'all' },
    { label: 'Formation', value: 'formation' },
    { label: 'Lume',      value: 'lume' },
  ]

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <h1 className="text-2xl font-light tracking-wide text-fg-heading">Projects</h1>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 px-4 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          New Project
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
        {/* Tabs */}
        <div className="flex border border-fg-border">
          {tabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setEntityFilter(tab.value)}
              className={`px-3 py-1.5 text-xs font-light tracking-wide uppercase transition-colors border-r border-fg-border last:border-r-0 ${
                entityFilter === tab.value
                  ? 'bg-fg-dark text-white/80'
                  : 'text-fg-muted hover:text-fg-heading'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-muted" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-4 py-1.5 bg-transparent border border-fg-border text-fg-heading text-xs font-light placeholder-fg-muted/50 rounded-none outline-none focus:border-fg-heading transition-colors w-56"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        projects.length === 0 ? (
          <div className="border border-fg-border py-20 text-center">
            <FolderOpen className="w-10 h-10 text-fg-muted/30 mx-auto mb-5" />
            <p className="text-sm font-light text-fg-heading mb-2">No projects yet.</p>
            <p className="text-xs font-light text-[#8A8580] mb-6">
              Create your first project to get started.
            </p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Project
            </Link>
          </div>
        ) : (
          <div className="border border-fg-border py-16 text-center">
            <p className="text-sm font-light text-[#5A5550]">No projects match your search.</p>
          </div>
        )
      ) : (
        <div className="divide-y divide-fg-border border-t border-b border-fg-border">
          {filtered.map(p => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="flex items-center justify-between py-4 hover:bg-fg-card/40 -mx-2 px-2 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <EntityBadge entity={p.entity} short />
                <div>
                  <p className="text-sm font-light text-fg-heading group-hover:text-fg-dark transition-colors tracking-wide">
                    {p.name}
                  </p>
                  <p className="text-xs font-light text-fg-muted">{p.clientName} · {p.address}</p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-6">
                {p.foreman && (
                  <span className="text-xs font-light text-fg-muted">{p.foreman}</span>
                )}
                <div className="text-right">
                  <p className="text-sm font-light text-fg-heading tabular-nums">{formatCurrency(p.contractValue)}</p>
                  <div className="flex items-center justify-end gap-2 mt-0.5">
                    <StatusPill status={p.status} />
                    {p.stage && (
                      <span className={`text-2xs px-1.5 py-0.5 rounded-sm font-medium uppercase tracking-wide ${STAGE_COLOURS[p.stage as ProjectStage]}`}>
                        {STAGE_LABELS[p.stage as ProjectStage]}
                      </span>
                    )}
                  </div>
                  {p.nextAction && (
                    <p className="text-2xs text-fg-muted mt-0.5">→ {p.nextAction as string}</p>
                  )}
                </div>
                <div className="text-right w-40">
                  {(() => {
                    const { status, daysSlippage } = scheduleStatus(p)
                    const planned = p.baseline?.plannedCompletion
                    const expected = p.forecastCompletion || p.plannedCompletion
                    const dot = healthBg(status)
                    const col = healthColour(status)
                    if (planned) {
                      // Has baseline — show planned vs expected with traffic light
                      return (
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${dot} inline-block shrink-0`} />
                            <span className={`text-2xs font-medium ${col}`}>
                              {status === 'green' ? 'On schedule' : status === 'amber' ? `${daysSlippage}d behind` : `${daysSlippage}d delayed`}
                            </span>
                          </div>
                          <p className="text-2xs text-fg-muted">Planned: {formatProjectDate(planned)}</p>
                          <p className={`text-2xs ${status === 'green' ? 'text-green-600' : status === 'amber' ? 'text-amber-500' : 'text-red-500'}`}>
                            Expected: {formatProjectDate(expected || '') || 'TBC'}
                          </p>
                        </div>
                      )
                    }
                    // No baseline — show simple date
                    return (
                      <div className="text-xs font-light text-fg-muted">
                        <p>{formatProjectDate(p.startDate)}</p>
                        <p>→ {formatProjectDate(p.plannedCompletion) || 'TBC'}</p>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs font-light text-[#8A8580] mt-4">
          {filtered.length} project{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12"><p className="text-sm font-light text-fg-muted">Loading…</p></div>}>
      <ProjectsInner />
    </Suspense>
  )
}
