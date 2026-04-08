'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { loadProjects, loadEstimates, saveEstimate } from '@/lib/storage'
import { generateId } from '@/lib/utils'
import type { Project, Estimate, EstimateLineItem } from '@/types'
import { Suspense } from 'react'
import { FolderOpen } from 'lucide-react'

function parseBuildxactRows(rows: Record<string, unknown>[]): Omit<EstimateLineItem, 'id' | 'estimateId'>[] {
  const items: Omit<EstimateLineItem, 'id' | 'estimateId'>[] = []

  for (const row of rows) {
    const type = String(row['Type'] ?? '').trim()
    const totalRaw = parseFloat(String(row['Total'] ?? '0')) || 0
    const unitsRaw = row['Units']

    // Skip category header rows (no type and no total)
    if (!type && totalRaw === 0) continue

    // Skip rows where Units is "False" or 0 (category summary rows)
    if (String(unitsRaw) === 'False' || String(unitsRaw) === '0' && totalRaw === 0) continue

    const description = String(row['Description'] ?? '').trim()
    const code = String(row['Code'] ?? '').trim()
    const displayOrder = String(row['DisplayedOrder'] ?? row['Order'] ?? '').trim()
    const category = String(row['CategoryDescription'] ?? '').trim()
    const uom = String(row['UOM'] ?? '').trim()
    const unitCost = parseFloat(String(row['UnitCost'] ?? '0')) || 0
    const units = parseFloat(String(unitsRaw ?? '0')) || 0
    const total = totalRaw
    const markupRaw = parseFloat(String(row['Markup'] ?? '0')) || 0
    const totalIncMarkupAndTax = parseFloat(String(row['TotalIncMarkupAndTax'] ?? '0')) || 0
    const notes = String(row['Notes'] ?? '').trim()

    // Calculate markup percent
    let markupPercent = 0
    if (total > 0 && markupRaw !== 0) {
      markupPercent = (markupRaw / total) * 100
    }

    // Map type
    let normalizedType: EstimateLineItem['type'] = 'Material'
    const typeLower = type.toLowerCase()
    if (typeLower.includes('labour') || typeLower.includes('labor')) {
      normalizedType = 'Labour'
    } else if (typeLower.includes('subcontractor') || typeLower.includes('sub-contractor') || typeLower.includes('concrete pump')) {
      normalizedType = 'Subcontractor'
    } else if (typeLower.includes('equipment') || typeLower.includes('plant')) {
      normalizedType = 'Equipment'
    } else if (typeLower.includes('material') || typeLower.includes('supply')) {
      normalizedType = 'Material'
    }

    // Map crewType
    const crewType: EstimateLineItem['crewType'] =
      normalizedType === 'Labour' ? 'Formation'
      : normalizedType === 'Subcontractor' ? 'Subcontractor'
      : 'Formation'

    // Use code as description fallback
    const finalDescription = !description || description === 't' ? code : description

    // Calculate revenue
    const revenue = totalIncMarkupAndTax > 0 ? totalIncMarkupAndTax : total * (1 + markupPercent / 100)

    items.push({
      displayOrder,
      category,
      description: finalDescription,
      type: normalizedType,
      crewType,
      units,
      uom,
      unitCost,
      total,
      markupPercent,
      revenue,
      notes,
    })
  }

  return items
}

function NewEstimateForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedProject = searchParams.get('projectId') || ''
  const fromProposalId    = searchParams.get('proposalId') || ''
  const fromClientName    = searchParams.get('clientName') || ''
  const fromAddress       = searchParams.get('address') || ''

  // Build a suggested name from the proposal address (suburb – client)
  const suggestedName = fromClientName && fromAddress
    ? (() => {
        const suburb = fromAddress.split(',').slice(-2, -1)[0]?.trim() || fromAddress.trim()
        return `${suburb} – ${fromClientName}`
      })()
    : ''

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [importedItems, setImportedItems] = useState<Omit<EstimateLineItem, 'id' | 'estimateId'>[]>([])
  const [projectType, setProjectType] = useState<'landscape_only' | 'landscape_and_pool' | 'pool_only' | ''>('')
  const [projectTypeError, setProjectTypeError] = useState(false)
  const [form, setForm] = useState({
    projectId: preselectedProject,
    name: suggestedName,
    notes: '',
    defaultMarkupFormation: 40,
    defaultMarkupSubcontractor: 35,
  })

  useEffect(() => {
    const loaded = loadProjects().filter(p => p.status !== 'invoiced')
    setProjects(loaded)
    setLoading(false)
  }, [])

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      try {
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
        const items = parseBuildxactRows(rows)
        setImportedItems(items)
      } catch (err) {
        console.error('Failed to parse file:', err)
        alert('Failed to parse file. Please ensure it is a valid Buildxact CSV or Excel export.')
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleCreate = () => {
    if (!projectType) { setProjectTypeError(true); return }
    setProjectTypeError(false)
    // Project is optional — estimate can exist without a project
    const project = form.projectId ? projects.find(p => p.id === form.projectId) : null

    // Get next version (for this project if assigned, or globally)
    const existingVersions = form.projectId
      ? loadEstimates().filter(e => e.projectId === form.projectId)
      : loadEstimates()
    const nextVersion = existingVersions.length > 0
      ? Math.max(...existingVersions.map(e => e.version)) + 1
      : 1

    const estimateId = generateId()

    const lineItems: EstimateLineItem[] = importedItems.map(item => ({
      ...item,
      id: generateId(),
      estimateId,
    }))

    const estimate: Estimate = {
      id: estimateId,
      projectId: form.projectId || '',
      projectName: project?.name || form.name || 'Unassigned',
      name: form.name,
      version: nextVersion,
      status: 'draft',
      defaultMarkupFormation: form.defaultMarkupFormation,
      defaultMarkupSubcontractor: form.defaultMarkupSubcontractor,
      lineItems,
      notes: form.notes,
      ...(fromProposalId ? { proposalId: fromProposalId } : {}),
      ...(projectType ? { projectType: projectType as 'landscape_only' | 'landscape_and_pool' | 'pool_only' } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    saveEstimate(estimate)
    router.push(`/estimates/${estimate.id}`)
  }



  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      <div className="flex items-center gap-2 mb-8 text-xs font-light text-fg-muted">
        <Link href="/estimates" className="hover:text-fg-heading transition-colors">Estimates</Link>
        <span>/</span>
        <span className="text-fg-heading">New</span>
      </div>

      <h1 className="text-2xl font-light tracking-wide text-fg-heading mb-6">New Estimate</h1>

      {fromProposalId && (
        <div className="mb-6 px-4 py-3 border border-fg-border/60 bg-fg-card/20 flex items-center justify-between">
          <div>
            <p className="text-xs font-light text-fg-heading">From proposal: {fromClientName}</p>
            <p className="text-2xs text-fg-muted">{fromAddress}</p>
          </div>
          <span className="text-2xs text-fg-muted border border-fg-border/50 px-2 py-0.5 rounded-sm">Linked</span>
        </div>
      )}

        <div className="max-w-md space-y-6">
          {/* Import section */}
          <div className="mb-8 p-5 border border-fg-border bg-fg-card/20">
            <p className="text-xs font-light tracking-architectural uppercase text-fg-muted mb-3">Import from Buildxact</p>
            <p className="text-xs font-light text-[#8A8580] mb-4">Export your estimate from Buildxact as CSV or Excel, then upload it here.</p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileImport}
              className="text-xs font-light text-fg-muted file:mr-3 file:px-3 file:py-1.5 file:border file:border-fg-border file:bg-fg-bg file:text-xs file:font-light file:text-fg-heading file:rounded-none file:cursor-pointer hover:file:bg-fg-card"
            />
            {importedItems.length > 0 && (
              <p className="mt-2 text-xs font-light text-green-600">{importedItems.length} line items ready to import</p>
            )}
          </div>

          {/* Optional project assignment */}
          {projects.length > 0 && (
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">
                Link to Project <span className="text-fg-muted/50">(optional)</span>
              </label>
              <select
                value={form.projectId}
                onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors appearance-none"
              >
                <option value="">No project — standalone estimate</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Project Type — required */}
          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-2">
              Project Type <span className="text-red-400">*</span>
            </label>
            <div className={`flex border ${projectTypeError ? 'border-red-400/50' : 'border-fg-border'}`}>
              {([
                ['landscape_only',     'Landscape Only'],
                ['landscape_and_pool', 'Landscape + Pool'],
                ['pool_only',          'Pool Only'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setProjectType(val); setProjectTypeError(false) }}
                  className={`flex-1 py-2.5 text-xs font-light tracking-wide uppercase transition-colors border-r border-fg-border last:border-r-0 ${
                    projectType === val ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {projectTypeError && <p className="text-xs text-red-400/70 font-light mt-1">Please select a project type</p>}
            {projectType && (
              <p className="text-2xs text-fg-muted mt-1.5">
                {projectType === 'landscape_only'     && 'Formation scope · Progress claims'}
                {projectType === 'landscape_and_pool' && 'Formation + Lume Pools · Mixed invoicing'}
                {projectType === 'pool_only'          && 'Lume Pools scope · Stage-based invoicing'}
              </p>
            )}
          </div>

          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Estimate Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Full scope — Option A"
              className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-[#8A8580]"
            />
          </div>

          <div>
            <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Notes / Version Description</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Revised scope after site visit"
              className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-[#8A8580]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Formation Markup %</label>
              <input
                type="number"
                value={form.defaultMarkupFormation}
                onChange={e => setForm(f => ({ ...f, defaultMarkupFormation: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors tabular-nums"
              />
              <p className="text-2xs text-[#8A8580] mt-1">Default: 40% → 28.6% margin</p>
            </div>
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Subcontractor Markup %</label>
              <input
                type="number"
                value={form.defaultMarkupSubcontractor}
                onChange={e => setForm(f => ({ ...f, defaultMarkupSubcontractor: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors tabular-nums"
              />
              <p className="text-2xs text-[#8A8580] mt-1">Default: 35% → 25.9% margin</p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={handleCreate}
              className="px-6 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              Create Estimate
            </button>
            <Link href="/estimates" className="text-xs font-light tracking-wide uppercase text-[#6B6560] hover:text-fg-heading transition-colors">
              Cancel
            </Link>
          </div>
        </div>
    </div>
  )
}

export default function NewEstimatePage() {
  return (
    <Suspense fallback={<div className="max-w-[1200px] mx-auto px-6 py-12"><p className="text-sm font-light text-fg-muted">Loading…</p></div>}>
      <NewEstimateForm />
    </Suspense>
  )
}
