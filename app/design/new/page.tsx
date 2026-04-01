'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveProposal } from '@/lib/storage'
import { formatCurrency, generateId } from '@/lib/utils'
import type { DesignProposal, ProposalContentBlock } from '@/types'
import ProposalPreview from '@/components/ProposalPreview'
import ContentBlockEditor from '@/components/ContentBlockEditor'

export default function NewProposalPage() {
  const router = useRouter()

  const defaultValidUntil = new Date()
  defaultValidUntil.setDate(defaultValidUntil.getDate() + 30)

  const DEFAULT_PHASE1_SCOPE = `2D Landscape plan.
Materials and finishes – extent and type of hard surfacing for pathways, decking, etc.
Prepare a selection of 'stills' from the model to describe features and details in 3D for in-depth discussion.
A meeting to discuss the design and associated construction costs with you.`

  const DEFAULT_PHASE2_SCOPE = `Planting Schedule nominating and locating all planting for the project (botanical names, common names, container sizes, spacing, and quantities).
12v Landscape Lighting Plan including: Location of fittings, lighting schedule with the specification of fittings (make / model etc.) & quantities, lamp types, zoning/switching.
Front fence elevation and details plan.
Water feature detail plan schematic plan.
Materials and finishes selections and schedule.
Landscape specification - finished surface levels.`

  const DEFAULT_CONTENT_BLOCKS: ProposalContentBlock[] = [
    {
      id: generateId(),
      type: 'video',
      content: 'https://vimeo.com/892469176',
      caption: 'Formation Landscapes — our approach to design and construction',
      position: 'before_phases',
    },
    {
      id: generateId(),
      type: 'video',
      content: 'https://vimeo.com/890881290',
      caption: 'Recent projects by Formation Landscapes',
      position: 'after_phases',
    },
  ]

  const DEFAULT_INTRO_TEXT = `Thank you for the opportunity to meet on site and discuss your project.

From our initial consultation, it's clear there is a strong opportunity to reshape the landscape into a highly resolved, functional, and visually cohesive environment.

The following outlines our proposed design process and associated fees.`

  const [form, setForm] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    projectAddress: '',
    introText: DEFAULT_INTRO_TEXT,
    phase1Scope: DEFAULT_PHASE1_SCOPE,
    phase1Fee: '9800',
    phase2Scope: DEFAULT_PHASE2_SCOPE,
    phase2Fee: '3500',
    includePhase3: false,
    phase3Scope: '',
    phase3Fee: '',
    validUntil: defaultValidUntil.toISOString().split('T')[0],
    notes: '',
  })
  const [preview, setPreview] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [contentBlocks, setContentBlocks] = useState<ProposalContentBlock[]>(DEFAULT_CONTENT_BLOCKS)

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.clientName.trim())  e.clientName  = 'Required'
    if (!form.phase1Scope.trim()) e.phase1Scope = 'Required'
    if (!form.phase1Fee)          e.phase1Fee   = 'Required'
    if (!form.phase2Scope.trim()) e.phase2Scope = 'Required'
    if (!form.phase2Fee)          e.phase2Fee   = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const buildProposal = (status: DesignProposal['status']): DesignProposal => ({
    id: generateId(),
    clientName: form.clientName,
    clientEmail: form.clientEmail || undefined,
    clientPhone: form.clientPhone || undefined,
    projectAddress: form.projectAddress,
    status,
    introText: form.introText || undefined,
    phase1Fee:   parseFloat(form.phase1Fee.replace(/[^0-9.]/g, '')) || 0,
    phase1Scope: form.phase1Scope,
    phase2Fee:   parseFloat(form.phase2Fee.replace(/[^0-9.]/g, '')) || 0,
    phase2Scope: form.phase2Scope,
    phase3Fee:   form.includePhase3 ? (parseFloat(form.phase3Fee.replace(/[^0-9.]/g, '')) || 0) : undefined,
    phase3Scope: form.includePhase3 ? form.phase3Scope : undefined,
    validUntil: form.validUntil,
    acceptanceToken: generateId(),
    notes: form.notes,
    createdAt: new Date().toISOString(),
    contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
  })

  const handleSaveDraft = () => {
    if (!validate()) return
    const p = buildProposal('draft')
    saveProposal(p)
    router.push(`/design/${p.id}`)
  }

  const handleSend = () => {
    if (!validate()) return
    const p = buildProposal('sent')
    saveProposal(p)
    router.push(`/design/${p.id}`)
  }

  const phase1Fee = parseFloat(form.phase1Fee.replace(/[^0-9.]/g, '')) || 0
  const phase2Fee = parseFloat(form.phase2Fee.replace(/[^0-9.]/g, '')) || 0
  const phase3Fee = form.includePhase3 ? (parseFloat(form.phase3Fee.replace(/[^0-9.]/g, '')) || 0) : 0
  const totalFee  = phase1Fee + phase2Fee + phase3Fee

  if (preview) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setPreview(false)}
            className="text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors mb-8"
          >
            ← Back to edit
          </button>
          <ProposalPreview
            clientName={form.clientName}
            projectAddress={form.projectAddress}
            introText={form.introText}
            phase1Scope={form.phase1Scope}
            phase1Fee={phase1Fee}
            phase2Scope={form.phase2Scope}
            phase2Fee={phase2Fee}
            phase3Scope={form.includePhase3 ? form.phase3Scope : undefined}
            phase3Fee={form.includePhase3 ? phase3Fee : undefined}
            validUntil={form.validUntil}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      <div className="max-w-xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-8 text-xs font-light text-fg-muted">
          <Link href="/design" className="hover:text-fg-heading transition-colors">Design</Link>
          <span>/</span>
          <span className="text-fg-heading">New Proposal</span>
        </div>

        <h1 className="text-2xl font-light tracking-wide text-fg-heading mb-10">New Design Proposal</h1>

        <div className="space-y-8">
          {/* Client details */}
          <div className="space-y-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Client</p>
            <Field label="Client Name" value={form.clientName} onChange={v => set('clientName', v)} error={errors.clientName} placeholder="e.g. Smith" />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Client Email" value={form.clientEmail} onChange={v => set('clientEmail', v)} placeholder="client@example.com" type="email" />
              <Field label="Client Phone" value={form.clientPhone} onChange={v => set('clientPhone', v)} placeholder="0400 000 000" />
            </div>
            <Field label="Project Address" value={form.projectAddress} onChange={v => set('projectAddress', v)} placeholder="123 Example St" />
          </div>

          <div className="h-px bg-fg-border" />

          {/* Intro text */}
          <div className="space-y-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Introduction Text</p>
            <p className="text-xs font-light text-fg-muted/60 -mt-2">Personalised intro shown on the client-facing proposal</p>
            <div>
              <textarea
                value={form.introText}
                onChange={e => set('introText', e.target.value)}
                rows={5}
                placeholder="Thank you for the opportunity to meet on site and discuss your project..."
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed"
              />
            </div>
          </div>

          <div className="h-px bg-fg-border" />

          {/* Phase 1 */}
          <div className="space-y-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Phase 1 — Concept Design</p>
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Scope</label>
              <textarea
                value={form.phase1Scope}
                onChange={e => set('phase1Scope', e.target.value)}
                rows={3}
                placeholder="2D Landscape plan. Materials and finishes – extent and type of hard surfacing for pathways, decking, etc. Prepare a selection of stills from the model to describe features and details in 3D for in-depth discussion. A meeting to discuss the design and associated construction costs."
                className={`w-full px-3 py-2.5 bg-transparent border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed ${errors.phase1Scope ? 'border-red-400/50' : 'border-fg-border'}`}
              />
              {errors.phase1Scope && <p className="text-xs text-red-400/70 font-light mt-1">{errors.phase1Scope}</p>}
            </div>
            <Field label="Fee ($)" value={form.phase1Fee} onChange={v => set('phase1Fee', v)} error={errors.phase1Fee} placeholder="9800" />
          </div>

          <div className="h-px bg-fg-border" />

          {/* Phase 2 */}
          <div className="space-y-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Phase 2 — Design Development</p>
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Scope</label>
              <textarea
                value={form.phase2Scope}
                onChange={e => set('phase2Scope', e.target.value)}
                rows={3}
                placeholder="Planting Schedule nominating and locating all planting (botanical names, common names, container sizes, spacing, quantities). 12v Landscape Lighting Plan including location of fittings, lighting schedule, lamp types, zoning/switching. Front fence elevation and details plan. Materials and finishes selections and schedule. Landscape specification - finished surface levels."
                className={`w-full px-3 py-2.5 bg-transparent border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed ${errors.phase2Scope ? 'border-red-400/50' : 'border-fg-border'}`}
              />
              {errors.phase2Scope && <p className="text-xs text-red-400/70 font-light mt-1">{errors.phase2Scope}</p>}
            </div>
            <Field label="Fee ($)" value={form.phase2Fee} onChange={v => set('phase2Fee', v)} error={errors.phase2Fee} placeholder="3500" />
          </div>

          <div className="h-px bg-fg-border" />

          {/* Phase 3 (optional) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Phase 3 — Administration (Optional)</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.includePhase3}
                  onChange={e => set('includePhase3', e.target.checked)}
                  className="w-3.5 h-3.5 accent-fg-dark"
                />
                <span className="text-xs font-light text-fg-muted">Include</span>
              </label>
            </div>
            {form.includePhase3 && (
              <>
                <div>
                  <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Scope</label>
                  <textarea
                    value={form.phase3Scope}
                    onChange={e => set('phase3Scope', e.target.value)}
                    rows={3}
                    placeholder="Contract administration, site inspections, variation management…"
                    className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed"
                  />
                </div>
                <Field label="Fee ($)" value={form.phase3Fee} onChange={v => set('phase3Fee', v)} placeholder="2500" />
              </>
            )}
          </div>

          <div className="h-px bg-fg-border" />

          {/* Validity + notes */}
          <div className="space-y-4">
            <Field label="Valid Until" value={form.validUntil} onChange={v => set('validUntil', v)} type="date" />
            <div>
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">Internal Notes</label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40"
              />
            </div>
          </div>

          <div className="h-px bg-fg-border" />

          {/* Content blocks */}
          <ContentBlockEditor blocks={contentBlocks} onChange={setContentBlocks} />

          {/* Total */}
          {totalFee > 0 && (
            <div className="flex items-baseline justify-between py-4 border-t border-b border-fg-border">
              <span className="text-xs font-light tracking-architectural uppercase text-fg-muted">Total Design Fee</span>
              <span className="text-xl font-light text-fg-heading tabular-nums">{formatCurrency(totalFee)}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => { if (validate()) setPreview(true) }}
              className="px-4 py-2.5 border border-fg-border text-fg-heading text-xs font-light tracking-architectural uppercase hover:border-fg-heading transition-colors"
            >
              Preview
            </button>
            <button
              onClick={handleSaveDraft}
              className="px-5 py-2.5 border border-fg-border text-fg-heading text-xs font-light tracking-architectural uppercase hover:border-fg-heading transition-colors"
            >
              Save as Draft
            </button>
            <button
              onClick={handleSend}
              className="px-5 py-2.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              Save &amp; Send
            </button>
            <Link href="/design" className="text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors ml-1">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, error, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void
  error?: string; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 bg-transparent border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-fg-muted/40 ${error ? 'border-red-400/50' : 'border-fg-border'}`}
      />
      {error && <p className="text-xs text-red-400/70 font-light mt-1">{error}</p>}
    </div>
  )
}


