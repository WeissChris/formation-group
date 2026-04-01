'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveProject } from '@/lib/storage'
import { generateId } from '@/lib/utils'
import type { EntityType, Project, ProjectScope } from '@/types'
import Link from 'next/link'

type ProjectType = 'landscape_only' | 'landscape_and_pool' | 'pool_only'

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  landscape_only:      'Landscape Only',
  landscape_and_pool:  'Landscape + Pool',
  pool_only:           'Pool Only',
}

function buildScopes(pt: ProjectType): ProjectScope[] {
  if (pt === 'landscape_only') {
    return [{ id: generateId(), name: 'Landscape', entity: 'formation', invoiceModel: 'progress_claim' }]
  }
  if (pt === 'pool_only') {
    return [{ id: generateId(), name: 'Pool', entity: 'lume', invoiceModel: 'stage_based' }]
  }
  // landscape_and_pool
  return [
    { id: generateId(), name: 'Landscape', entity: 'formation', invoiceModel: 'progress_claim' },
    { id: generateId(), name: 'Pool',      entity: 'lume',      invoiceModel: 'stage_based'    },
  ]
}

function primaryEntity(pt: ProjectType): EntityType {
  if (pt === 'pool_only') return 'lume'
  return 'formation'
}

export default function NewProjectPage() {
  const router = useRouter()
  const [projectType, setProjectType] = useState<ProjectType>('landscape_only')
  const [form, setForm] = useState({
    name: '',
    clientName: '',
    address: '',
    contractValue: '',
    startDate: '',
    plannedCompletion: '',
    foreman: '',
    status: 'planning' as Project['status'],
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim())       e.name = 'Required'
    if (!form.clientName.trim()) e.clientName = 'Required'
    if (!form.contractValue)     e.contractValue = 'Required'
    if (!form.startDate)         e.startDate = 'Required'
    if (!form.plannedCompletion) e.plannedCompletion = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    const scopes = buildScopes(projectType)
    const entity = primaryEntity(projectType)
    const project: Project = {
      id: generateId(),
      entity,
      name: form.name.toUpperCase(),
      clientName: form.clientName,
      address: form.address,
      contractValue: parseFloat(form.contractValue.replace(/[^0-9.]/g, '')) || 0,
      startDate: form.startDate,
      plannedCompletion: form.plannedCompletion,
      foreman: form.foreman,
      status: form.status,
      notes: form.notes,
      projectType,
      scopes,
      invoiceModel: entity === 'formation' ? 'progress_claim' : 'stage_based',
      createdAt: new Date().toISOString(),
    }
    saveProject(project)
    router.push(`/projects/${project.id}`)
  }

  const scopes = buildScopes(projectType)

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 mb-8 text-xs font-light text-fg-muted">
          <Link href="/projects" className="hover:text-fg-heading transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-fg-heading">New Project</span>
        </div>

        <h1 className="text-2xl font-light tracking-wide text-fg-heading mb-10">New Project</h1>

        <div className="space-y-6">

          {/* Project Type */}
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-2">
              Project Type
            </label>
            <div className="flex border border-fg-border">
              {(['landscape_only', 'landscape_and_pool', 'pool_only'] as ProjectType[]).map(pt => (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setProjectType(pt)}
                  className={`flex-1 py-2.5 text-xs font-light tracking-wide uppercase transition-colors border-r border-fg-border last:border-r-0 ${
                    projectType === pt ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'
                  }`}
                >
                  {PROJECT_TYPE_LABELS[pt]}
                </button>
              ))}
            </div>
            {/* Scope preview */}
            <div className="mt-2 flex gap-2">
              {scopes.map(s => (
                <span key={s.id} className="text-2xs text-fg-muted border border-fg-border/60 px-2 py-1 rounded-sm">
                  {s.name} · {s.entity === 'formation' ? 'Formation' : 'Lume Pools'} · {s.invoiceModel === 'progress_claim' ? 'Progress Claims' : 'Stage-Based'}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Project Name" value={form.name} onChange={v => set('name', v)} error={errors.name} placeholder="e.g. Samara" className="uppercase" />
            <Field label="Client Name" value={form.clientName} onChange={v => set('clientName', v)} error={errors.clientName} placeholder="e.g. Ramondetta" />
          </div>

          <Field label="Address" value={form.address} onChange={v => set('address', v)} placeholder="16 Samara Rd, Burnside" />

          <div className="grid grid-cols-2 gap-4">
            <Field label="Contract Value ($)" value={form.contractValue} onChange={v => set('contractValue', v)} error={errors.contractValue} placeholder="450000" />
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors appearance-none"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="complete">Complete</option>
                <option value="invoiced">Invoiced</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" value={form.startDate} onChange={v => set('startDate', v)} error={errors.startDate} type="date" />
            <Field label="Planned Completion" value={form.plannedCompletion} onChange={v => set('plannedCompletion', v)} error={errors.plannedCompletion} type="date" />
          </div>

          <Field label="Foreman" value={form.foreman} onChange={v => set('foreman', v)} placeholder="e.g. Cameron" />

          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-[#8A8580] max-h-28"
            />
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              Save Project
            </button>
            <Link href="/projects" className="text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, error, placeholder, type = 'text', className = '' }: {
  label: string; value: string; onChange: (v: string) => void
  error?: string; placeholder?: string; type?: string; className?: string
}) {
  return (
    <div>
      <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          'w-full px-3 py-2.5 bg-transparent border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-fg-muted/40',
          error ? 'border-red-400/50' : 'border-fg-border',
          className,
        ].join(' ')}
      />
      {error && <p className="text-xs text-red-400/70 font-light mt-1">{error}</p>}
    </div>
  )
}
