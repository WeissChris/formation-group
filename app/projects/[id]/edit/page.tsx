'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { upsertProject, getProjects } from '@/lib/storageAsync'
import { loadProjects } from '@/lib/storage'
import type { Project } from '@/types'
import Link from 'next/link'

export default function EditProjectPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [form, setForm] = useState({
    name: '',
    clientName: '',
    address: '',
    contractValue: '',
    targetMarginPct: '',
    startDate: '',
    plannedCompletion: '',
    foreman: '',
    status: 'planning' as Project['status'],
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load the project (local first, Supabase fallback if this device hasn't cached it) and pre-fill.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let p = loadProjects().find(pr => pr.id === id)
      if (!p) p = (await getProjects()).find(pr => pr.id === id)
      if (cancelled) return
      if (!p) { setNotFound(true); return }
      setProject(p)
      setForm({
        name: p.name ?? '',
        clientName: p.clientName ?? '',
        address: p.address ?? '',
        contractValue: p.contractValue != null ? String(p.contractValue) : '',
        targetMarginPct: p.targetMarginPct != null ? String(p.targetMarginPct) : '40',
        startDate: p.startDate ?? '',
        plannedCompletion: p.plannedCompletion ?? '',
        foreman: p.foreman ?? '',
        status: p.status ?? 'planning',
        notes: p.notes ?? '',
      })
    })()
    return () => { cancelled = true }
  }, [id])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim())       e.name = 'Required'
    if (!form.clientName.trim()) e.clientName = 'Required'
    if (!form.contractValue)     e.contractValue = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!project || !validate()) return
    // Merge edited fields into the existing project so everything not on this form — stage, baseline,
    // scopes, entity, foremanPin, crewSize, etc. — is preserved untouched. upsertProject writes
    // localStorage immediately and pushes to Supabase.
    const updated: Project = {
      ...project,
      name: form.name.toUpperCase(),
      clientName: form.clientName,
      address: form.address,
      contractValue: parseFloat(form.contractValue.replace(/[^0-9.]/g, '')) || 0,
      targetMarginPct: parseFloat(form.targetMarginPct) || 40,
      startDate: form.startDate,
      plannedCompletion: form.plannedCompletion,
      foreman: form.foreman,
      status: form.status,
      notes: form.notes,
    }
    void upsertProject(updated)
    router.push(`/projects/${id}`)
  }

  if (notFound) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
        <p className="text-sm font-light text-fg-muted">Project not found. <Link href="/projects" className="text-fg-heading underline">Back to projects</Link></p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
        <p className="text-sm font-light text-fg-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 mb-8 text-xs font-light text-fg-muted">
          <Link href="/projects" className="hover:text-fg-heading transition-colors">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-fg-heading transition-colors">{project.name}</Link>
          <span>/</span>
          <span className="text-fg-heading">Edit</span>
        </div>

        <h1 className="text-2xl font-light tracking-wide text-fg-heading mb-10">Edit Project</h1>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Project Name" value={form.name} onChange={v => set('name', v)} error={errors.name} className="uppercase" />
            <Field label="Client Name" value={form.clientName} onChange={v => set('clientName', v)} error={errors.clientName} />
          </div>

          <Field label="Address" value={form.address} onChange={v => set('address', v)} placeholder="16 Samara Rd, Burnside" />

          <div className="grid grid-cols-3 gap-4">
            <Field label="Contract Value ($)" value={form.contractValue} onChange={v => set('contractValue', v)} error={errors.contractValue} placeholder="450000" />
            <Field label="Target GP %" value={form.targetMarginPct} onChange={v => set('targetMarginPct', v)} placeholder="40" />
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
            <Field label="Start Date" value={form.startDate} onChange={v => set('startDate', v)} type="date" />
            <Field label="Planned Completion" value={form.plannedCompletion} onChange={v => set('plannedCompletion', v)} type="date" />
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

          <p className="text-2xs font-light text-fg-muted/70">Stage is changed from the project page. Contract, status and the fields above save here.</p>

          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              Save Changes
            </button>
            <Link href={`/projects/${id}`} className="text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors">
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
