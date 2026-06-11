'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { upsertProposal } from '@/lib/storageAsync'
import { syncLegacyPhaseFields, phasesTotal, makeBlankPhase, DEFAULT_PHASE_TITLES, defaultPhaseDescription, defaultPhaseOutcome } from '@/lib/proposalPhases'
import { requestSendProposal, sendErrorMessage } from '@/lib/emailClient'
import { formatCurrency, generateId } from '@/lib/utils'
import type { DesignProposal, ProposalContentBlock, ProposalPhase } from '@/types'
import { Trash2 } from 'lucide-react'
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

  // No auto-added videos — the proposal already has the dedicated "Welcome to Formation" and
  // "Our Design Process" videos. Extra content blocks can be added manually if needed.
  const DEFAULT_CONTENT_BLOCKS: ProposalContentBlock[] = []

  const DEFAULT_INTRO_TEXT = `Thank you for the opportunity to meet on site and discuss your project.

From our initial consultation, it's clear there is a strong opportunity to reshape the landscape into a highly resolved, functional, and visually cohesive environment.

The following outlines our proposed design process and associated fees.`

  const [form, setForm] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    projectAddress: '',
    introText: DEFAULT_INTRO_TEXT,
    validUntil: defaultValidUntil.toISOString().split('T')[0],
    notes: '',
    welcomeVideoUrl: '',
    processVideoUrl: '',
  })
  // Editable, variable-length phases (same model as the proposal editor). Seeded with the two
  // standard phases; the user can rename, edit, add or remove them.
  const [phases, setPhases] = useState<ProposalPhase[]>([
    { id: generateId(), title: DEFAULT_PHASE_TITLES[0], fee: 9800, scope: DEFAULT_PHASE1_SCOPE, depositSplit: true },
    { id: generateId(), title: DEFAULT_PHASE_TITLES[1], fee: 3500, scope: DEFAULT_PHASE2_SCOPE },
  ])
  const [preview, setPreview] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [contentBlocks, setContentBlocks] = useState<ProposalContentBlock[]>(DEFAULT_CONTENT_BLOCKS)

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))
  const updatePhase = (i: number, patch: Partial<ProposalPhase>) =>
    setPhases(ps => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const addPhase = () => setPhases(ps => [...ps, makeBlankPhase(ps.length + 1)])
  const removePhase = (i: number) => setPhases(ps => ps.filter((_, idx) => idx !== i))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.clientName.trim()) e.clientName = 'Required'
    setErrors(e)
    if (!phases.some(p => p.scope.trim() && p.fee > 0)) {
      window.alert('Add at least one phase with a scope and a fee.')
      return false
    }
    return Object.keys(e).length === 0
  }

  const buildProposal = (status: DesignProposal['status']): DesignProposal => {
    const base: DesignProposal = {
      id: generateId(),
      clientName: form.clientName,
      clientEmail: form.clientEmail || undefined,
      clientPhone: form.clientPhone || undefined,
      projectAddress: form.projectAddress,
      status,
      introText: form.introText || undefined,
      // legacy phase1/2/3 fields are filled by syncLegacyPhaseFields from the phases array
      phase1Fee: 0, phase1Scope: '', phase2Fee: 0, phase2Scope: '',
      validUntil: form.validUntil,
      acceptanceToken: generateId(),
      notes: form.notes,
      welcomeVideoUrl: form.welcomeVideoUrl || undefined,
      processVideoUrl: form.processVideoUrl || undefined,
      createdAt: new Date().toISOString(),
      contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined,
    }
    return syncLegacyPhaseFields(base, phases)
  }

  const handleSaveDraft = () => {
    if (!validate()) return
    const p = buildProposal('draft')
    void upsertProposal(p)   // local (immediate) + Supabase (background)
    router.push(`/design/${p.id}`)
  }

  // Save & Send: emails the client a link to the proposal. The proposal must reach Supabase
  // BEFORE the email goes out, because the client opens the link on their own device (no local
  // copy) — so we await the upsert, then send.
  const handleSend = async () => {
    if (!validate()) return
    if (!form.clientEmail.trim()) {
      setErrors(e => ({ ...e, clientEmail: 'Add a client email to send' }))
      window.alert('Add a client email address to send the proposal (or use Save as Draft).')
      return
    }
    const p = buildProposal('sent')
    await upsertProposal(p)
    const result = await requestSendProposal(p)
    if (!result.ok) {
      window.alert(`Saved, but the email couldn’t be sent: ${sendErrorMessage(result.error)}\n\nYou can resend from the proposal page.`)
    }
    router.push(`/design/${p.id}`)
  }

  const totalFee = phasesTotal(phases)

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
            phases={phases}
            validUntil={form.validUntil}
            welcomeVideoUrl={form.welcomeVideoUrl}
            processVideoUrl={form.processVideoUrl}
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
              <Field label="Client Email" value={form.clientEmail} onChange={v => set('clientEmail', v)} error={errors.clientEmail} placeholder="client@example.com" type="email" />
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

          {/* Phases — editable, variable length (rename, edit, add or remove) */}
          <div className="space-y-4">
            <div className="flex items-baseline justify-between">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Phases</p>
              <p className="text-2xs font-light text-fg-muted/60">Rename, edit, add or remove — these show on the client proposal</p>
            </div>

            {phases.map((phase, i) => (
              <div key={phase.id} className="border border-fg-border/70 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xs font-light tracking-architectural uppercase text-fg-muted whitespace-nowrap">Phase {i + 1}</span>
                  <input
                    value={phase.title}
                    onChange={e => updatePhase(i, { title: e.target.value })}
                    placeholder="Phase title (e.g. Concept Design)"
                    className="flex-1 px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors"
                  />
                  <input
                    type="number"
                    value={phase.fee || ''}
                    onChange={e => updatePhase(i, { fee: parseFloat(e.target.value) || 0 })}
                    placeholder="Fee"
                    className="w-28 px-2 py-1.5 text-right bg-transparent border border-fg-border text-fg-heading text-sm font-light tabular-nums outline-none focus:border-fg-heading transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => removePhase(i)}
                    disabled={phases.length <= 1}
                    title="Remove phase"
                    className="text-fg-muted hover:text-red-500 disabled:opacity-30 disabled:hover:text-fg-muted transition-colors p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Scope (deliverables)</label>
                  <textarea
                    value={phase.scope}
                    onChange={e => updatePhase(i, { scope: e.target.value })}
                    rows={3}
                    placeholder="One deliverable per line"
                    className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors resize-none leading-relaxed"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Description</label>
                    <textarea
                      value={phase.description ?? ''}
                      onChange={e => updatePhase(i, { description: e.target.value })}
                      rows={3}
                      placeholder={defaultPhaseDescription(i)}
                      className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-muted text-2xs font-light outline-none focus:border-fg-heading transition-colors resize-none leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Outcome</label>
                    <textarea
                      value={phase.outcome ?? ''}
                      onChange={e => updatePhase(i, { outcome: e.target.value })}
                      rows={3}
                      placeholder={defaultPhaseOutcome(i)}
                      className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-muted text-2xs font-light outline-none focus:border-fg-heading transition-colors resize-none leading-relaxed"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-2xs font-light text-fg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!phase.depositSplit}
                    onChange={e => updatePhase(i, { depositSplit: e.target.checked })}
                    className="w-3.5 h-3.5 accent-fg-dark"
                  />
                  Bill as 50% deposit + 50% balance (otherwise 100% on completion)
                </label>
              </div>
            ))}

            <button
              type="button"
              onClick={addPhase}
              className="px-3 py-1.5 text-2xs font-light tracking-architectural uppercase border border-dashed border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors"
            >
              + Add phase
            </button>
          </div>

          <div className="h-px bg-fg-border" />

          {/* Validity + notes */}
          <div className="space-y-4">
            <Field label="Valid Until" value={form.validUntil} onChange={v => set('validUntil', v)} type="date" />
            
            {/* ── Proposal Videos ── */}
            <div className="col-span-2 space-y-3 pt-2">
              <h4 className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Proposal Videos</h4>
              <Field label="Welcome Video URL" value={form.welcomeVideoUrl} onChange={v => set('welcomeVideoUrl', v)} placeholder="https://vimeo.com/... (leave blank for default)" />
              <Field label="Process Video URL" value={form.processVideoUrl} onChange={v => set('processVideoUrl', v)} placeholder="https://vimeo.com/... (leave blank for default)" />
            </div>
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


