'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadProposals, saveProposal, generateRevenueFromProposal, generateInvoiceStages, saveDesignProject, loadDesignProjectByProposalId, buildDesignProjectFromProposal } from '@/lib/storage'
import { upsertProposal, getProposals, reconcileProposals, deleteProposalAsync } from '@/lib/storageAsync'
import { formatCurrency } from '@/lib/utils'
import { getProposalPhases, syncLegacyPhaseFields, phasesTotal, makeBlankPhase, defaultPhaseDescription, defaultPhaseOutcome, DEFAULT_PROGRAM_TEXT } from '@/lib/proposalPhases'
import { requestSendProposal, sendErrorMessage } from '@/lib/emailClient'
import type { DesignProposal, ProposalContentBlock, ProposalPhase } from '@/types'
import { Trash2, Copy, Check, Pencil, Mail } from 'lucide-react'
import ProposalPreview from '@/components/ProposalPreview'
import ContentBlockEditor from '@/components/ContentBlockEditor'

export default function ProposalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [proposal, setProposal] = useState<DesignProposal | null>(null)
  const [tab, setTab] = useState<'detail' | 'content' | 'preview'>('detail')
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [contentBlocks, setContentBlocks] = useState<ProposalContentBlock[]>([])
  const [blocksSaved, setBlocksSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  // Which read-only text field was clicked, so toggling into edit mode lands focus straight in it.
  // The single Edit button is at the top of a long form; clicking a field's text anywhere on the page
  // now drops you into editing THAT box (otherwise the lower fields look un-editable until you scroll
  // up and hit Edit).
  const [focusField, setFocusField] = useState<'intro' | 'email' | 'program' | null>(null)
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Reconcile client acceptances from Supabase first, so a proposal accepted on the public page
      // (or another device) shows as accepted here instead of a stale local "sent".
      try { await reconcileProposals() } catch { /* offline — fall back to local copy */ }
      if (cancelled) return
      let p = loadProposals().find(pr => pr.id === id)
      if (!p) {
        // Local copy may have been cleared — fall back to Supabase and restore it locally
        p = (await getProposals()).find(pr => pr.id === id)
        if (p) saveProposal(p)
      }
      if (cancelled) return
      if (!p) { router.push('/design'); return }
      setContentBlocks(p.contentBlocks ?? [])
      if (p.status === 'accepted' && (!p.invoiceStages || p.invoiceStages.length === 0)) {
        const stages = generateInvoiceStages(p)
        const withStages = { ...p, invoiceStages: stages }
        saveProposal(withStages)
        setProposal(withStages)
      } else {
        setProposal(p)
      }
    })()
    return () => { cancelled = true }
  }, [id, router])

  if (!proposal) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  const phases = getProposalPhases(proposal)
  const total = phasesTotal(phases)

  // ── Phase editing ──────────────────────────────────────────────────────────
  // Apply a new phase list: sync the legacy phase1/2/3 fields, save locally + update the UI.
  const applyPhases = (next: ProposalPhase[]) => {
    const updated = syncLegacyPhaseFields(proposal, next)
    saveProposal(updated)
    setProposal(updated)
  }
  // Push the latest saved proposal to Supabase so the client-facing proposal reflects the edit.
  const syncPhasesRemote = () => { void upsertProposal(loadProposals().find(p => p.id === proposal.id) ?? proposal) }
  const setPhaseField = (i: number, patch: Partial<ProposalPhase>) =>
    applyPhases(phases.map((ph, idx) => (idx === i ? { ...ph, ...patch } : ph)))
  const addPhase = () => { applyPhases([...phases, makeBlankPhase(phases.length + 1)]); syncPhasesRemote() }
  const removePhase = (i: number) => { applyPhases(phases.filter((_, idx) => idx !== i)); syncPhasesRemote() }

  // Save a top-level proposal field (client details, intro, etc.): local + UI + Supabase.
  const saveProposalField = (patch: Partial<DesignProposal>) => {
    const updated: DesignProposal = { ...proposal, ...patch, updatedAt: new Date().toISOString() }
    saveProposal(updated)
    setProposal(updated)
    void upsertProposal(updated)
  }

  const acceptanceUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/proposal/${proposal.acceptanceToken}`
    : `/proposal/${proposal.acceptanceToken}`

  const handleCopyLink = () => {
    navigator.clipboard.writeText(acceptanceUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyProposalLink = () => {
    navigator.clipboard.writeText(acceptanceUrl)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  // Email the proposal to the client. Captures the email inline if it's missing, then pushes
  // the proposal to Supabase BEFORE sending (the client opens the link on a different device, so
  // the public page must be able to read it from the server), then sends and marks it sent.
  const handleEmailToClient = async () => {
    let email = (proposal.clientEmail || '').trim()
    if (!email) {
      email = (window.prompt('Send to which client email address?') || '').trim()
      if (!email) return
    }
    if (!window.confirm(`Email this proposal to ${email}?`)) return
    setSending(true)
    try {
      const toSend: DesignProposal = {
        ...proposal,
        clientEmail: email,
        status: proposal.status === 'draft' ? 'sent' : proposal.status,
      }
      saveProposal(toSend)
      setProposal(toSend)
      await upsertProposal(toSend)           // ensure the server has it before the client clicks
      const result = await requestSendProposal(toSend)
      if (result.ok) {
        setSentMsg(`Sent to ${email}`)
        setTimeout(() => setSentMsg(''), 6000)
      } else {
        window.alert(sendErrorMessage(result.error))
      }
    } finally {
      setSending(false)
    }
  }

  const handleUpdateStatus = (status: DesignProposal['status']) => {
    const updated: DesignProposal = {
      ...proposal,
      status,
      ...(status === 'accepted' && !proposal.acceptedAt ? { acceptedAt: new Date().toISOString() } : {}),
    }
    saveProposal(updated)
    void upsertProposal(updated) // push the status change to Supabase, not just localStorage
    if (status === 'accepted') {
      generateRevenueFromProposal(updated)
      // Create the design-delivery tracker row if it doesn't exist yet
      if (!loadDesignProjectByProposalId(updated.id)) {
        saveDesignProject(buildDesignProjectFromProposal(updated))
      }
    }
    setProposal(updated)
  }

  const handleDelete = () => {
    if (!confirm('Delete this proposal?')) return
    // Delete from Supabase too — otherwise the add-missing reconcile resurrects it on the next load.
    void deleteProposalAsync(id)
    router.push('/design')
  }

  const handleSaveBlocks = () => {
    const updated = { ...proposal, contentBlocks: contentBlocks.length > 0 ? contentBlocks : undefined }
    saveProposal(updated)
    setProposal(updated)
    setBlocksSaved(true)
    setTimeout(() => setBlocksSaved(false), 2000)
  }

  const sendInvoice = (stageId: string) => {
    if (!proposal) return
    const updated = (proposal.invoiceStages ?? []).map(s =>
      s.id === stageId
        ? { ...s, status: 'sent' as const, sentDate: new Date().toISOString() }
        : s
    )
    const updatedProposal = { ...proposal, invoiceStages: updated }
    saveProposal(updatedProposal)
    setProposal(updatedProposal)
  }

  const markPaid = (stageId: string) => {
    if (!proposal) return
    const updated = (proposal.invoiceStages ?? []).map(s =>
      s.id === stageId
        ? { ...s, status: 'paid' as const, paidDate: new Date().toISOString() }
        : s
    )
    const updatedProposal = { ...proposal, invoiceStages: updated }
    saveProposal(updatedProposal)
    setProposal(updatedProposal)
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-8 text-xs font-light text-fg-muted">
        <Link href="/design" className="hover:text-fg-heading transition-colors">Design</Link>
        <span>/</span>
        <span className="text-fg-heading">{proposal.clientName}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">{proposal.clientName}</h1>
          {proposal.clientEmail && (
            <p className="text-xs font-light text-fg-muted mt-0.5">{proposal.clientEmail}</p>
          )}
          <p className="text-sm font-light text-fg-muted">{proposal.projectAddress}</p>
          <p className="text-xs font-light text-fg-muted mt-1">
            Created {new Date(proposal.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setEditing(e => !e); setFocusField(null) }}
            className="flex items-center gap-1.5 border border-fg-border text-fg-muted px-3 py-1.5 text-xs hover:text-fg-heading transition-colors"
          >
            <Pencil className="w-3 h-3" /> {editing ? 'Cancel' : 'Edit'}
          </button>
          <button
            onClick={handleDelete}
            className="text-xs font-light text-red-400/50 hover:text-red-400 transition-colors border border-red-300/20 px-3 py-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-4 mb-8 pb-8 border-b border-fg-border">
        <div className="flex border border-fg-border">
          {(['draft', 'sent', 'accepted', 'lost', 'declined'] as DesignProposal['status'][]).map(s => (
            <button
              key={s}
              onClick={() => handleUpdateStatus(s)}
              className={`px-3 py-1.5 text-xs font-light tracking-wide uppercase transition-colors border-r border-fg-border last:border-r-0 ${
                proposal.status === s ? 'bg-fg-dark text-white/80' : 'text-fg-muted hover:text-fg-heading'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {(proposal.status === 'sent' || proposal.status === 'draft') && (
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors border border-fg-border px-3 py-1.5"
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copied!' : 'Copy acceptance link'}
          </button>
        )}

        {(proposal.status === 'draft' || proposal.status === 'sent') && (
          <button
            onClick={handleEmailToClient}
            disabled={sending}
            className="flex items-center gap-2 px-4 py-1.5 bg-fg-dark text-white/90 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors disabled:opacity-50"
          >
            <Mail className="w-3 h-3" />
            {sending ? 'Sending…' : proposal.status === 'sent' ? 'Resend to client' : 'Email to client'}
          </button>
        )}

        {sentMsg && <span className="text-xs font-light text-emerald-600">{sentMsg}</span>}

        {(proposal.status === 'sent' || proposal.status === 'pending') && proposal.firstViewedAt && (
          <span
            className="flex items-center gap-1.5 text-xs font-light text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-sm"
            title={`Opened ${new Date(proposal.firstViewedAt).toLocaleString('en-AU')}`}
          >
            👁 Opened by client on{' '}
            {new Date(proposal.firstViewedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        )}

        {proposal.acceptedAt && (
          <p className="text-xs font-light text-fg-muted">
            Accepted by {proposal.acceptedByName || 'Client'} on{' '}
            {new Date(proposal.acceptedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}

        {proposal.status === 'accepted' && (
          <Link
            href={`/estimates/new?proposalId=${id}&clientName=${encodeURIComponent(proposal.clientName)}&address=${encodeURIComponent(proposal.projectAddress)}`}
            className="flex items-center gap-2 px-4 py-1.5 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
          >
            Create Estimate →
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-fg-border mb-8">
        {(['detail', 'content', 'preview'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-xs font-light tracking-wide uppercase transition-colors border-b-2 -mb-px ${
              tab === t ? 'border-fg-heading text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading'
            }`}
          >
            {t === 'content' ? `Content${contentBlocks.length > 0 ? ` (${contentBlocks.length})` : ''}` : t}
          </button>
        ))}
      </div>

      {/* ── Detail tab ── */}
      {tab === 'detail' && (
        <div className="max-w-lg space-y-6">
          {/* Client details — editable in Edit mode (so a typo'd email/name can be fixed) */}
          <div className="border border-fg-border p-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-3">Client Details</p>
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Client name</label>
                    <input
                      defaultValue={proposal.clientName}
                      onBlur={e => saveProposalField({ clientName: e.target.value })}
                      className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Second client (optional)</label>
                    <input
                      defaultValue={proposal.clientName2 ?? ''}
                      onBlur={e => saveProposalField({ clientName2: e.target.value.trim() || undefined })}
                      placeholder="e.g. partner"
                      className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Client email</label>
                  <input
                    type="email"
                    defaultValue={proposal.clientEmail ?? ''}
                    onBlur={e => saveProposalField({ clientEmail: e.target.value.trim() || undefined })}
                    placeholder="client@example.com"
                    className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Client phone</label>
                    <input
                      defaultValue={proposal.clientPhone ?? ''}
                      onBlur={e => saveProposalField({ clientPhone: e.target.value.trim() || undefined })}
                      className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Project address</label>
                    <input
                      defaultValue={proposal.projectAddress}
                      onBlur={e => saveProposalField({ projectAddress: e.target.value })}
                      className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">CC on the email (optional)</label>
                  <input
                    defaultValue={proposal.ccEmails ?? ''}
                    onBlur={e => saveProposalField({ ccEmails: e.target.value.trim() || undefined })}
                    placeholder="partner@example.com, architect@example.com"
                    className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors"
                  />
                  <p className="text-2xs font-light text-fg-muted/60 mt-1">Comma-separated. CC&apos;d recipients are visible to the client.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm font-light">
                <p className="text-fg-heading">{proposal.clientName}</p>
                {proposal.clientEmail && <p className="text-fg-muted">{proposal.clientEmail}</p>}
                {proposal.clientPhone && <p className="text-fg-muted">{proposal.clientPhone}</p>}
                {proposal.projectAddress && <p className="text-fg-muted">{proposal.projectAddress}</p>}
                {proposal.ccEmails && <p className="text-fg-muted/80 text-2xs">CC: {proposal.ccEmails}</p>}
              </div>
            )}
          </div>

          {/* Proposal link */}
          <div className="border border-fg-border p-4 bg-fg-card/20">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Acceptance Link</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={acceptanceUrl}
                className="flex-1 px-2 py-1.5 bg-transparent border border-fg-border text-fg-muted text-xs font-light rounded-none outline-none font-mono"
              />
              <button
                onClick={handleCopyProposalLink}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-fg-border text-xs font-light text-fg-muted hover:text-fg-heading transition-colors whitespace-nowrap"
              >
                <Copy className="w-3 h-3" />
                {linkCopied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-fg-border">
            <div className="bg-fg-bg px-4 py-4">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Total Fee</p>
              <p className="text-lg font-light text-fg-heading tabular-nums">{formatCurrency(total)}</p>
            </div>
            <div className="bg-fg-bg px-4 py-4">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Valid Until</p>
              <p className="text-sm font-light text-fg-heading">
                {new Date(proposal.validUntil).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Phases — editable when in Edit mode (title, scope, description, outcome, fee; add/remove) */}
          <div className="border-t border-fg-border pt-5">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">Phases</p>
              {editing && <p className="text-2xs font-light text-fg-muted/60">Headings, scope, description &amp; outcome show on the client proposal</p>}
            </div>

            <div className="space-y-3">
              {phases.map((phase, i) => (
                <div key={phase.id} className="border border-fg-border/70 p-4">
                  {editing ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xs font-light tracking-architectural uppercase text-fg-muted whitespace-nowrap">Phase {i + 1}</span>
                        <input
                          defaultValue={phase.title}
                          onBlur={e => { setPhaseField(i, { title: e.target.value }); syncPhasesRemote() }}
                          placeholder="Phase title (e.g. Concept Design)"
                          className="flex-1 px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors"
                        />
                        <input
                          type="number"
                          defaultValue={phase.fee || ''}
                          onBlur={e => { setPhaseField(i, { fee: parseFloat(e.target.value) || 0 }); syncPhasesRemote() }}
                          placeholder="Fee"
                          className="w-28 px-2 py-1.5 text-right bg-transparent border border-fg-border text-fg-heading text-sm font-light tabular-nums outline-none focus:border-fg-heading transition-colors"
                        />
                        <button
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
                          defaultValue={phase.scope}
                          onBlur={e => { setPhaseField(i, { scope: e.target.value }); syncPhasesRemote() }}
                          rows={3}
                          placeholder="One deliverable per line"
                          className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors resize-none leading-relaxed"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Description</label>
                          <textarea
                            defaultValue={phase.description ?? ''}
                            onBlur={e => { setPhaseField(i, { description: e.target.value }); syncPhasesRemote() }}
                            rows={3}
                            placeholder={defaultPhaseDescription(i)}
                            className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-muted text-2xs font-light outline-none focus:border-fg-heading transition-colors resize-none leading-relaxed"
                          />
                        </div>
                        <div>
                          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Outcome</label>
                          <textarea
                            defaultValue={phase.outcome ?? ''}
                            onBlur={e => { setPhaseField(i, { outcome: e.target.value }); syncPhasesRemote() }}
                            rows={3}
                            placeholder={defaultPhaseOutcome(i)}
                            className="w-full px-2 py-1.5 bg-transparent border border-fg-border text-fg-muted text-2xs font-light outline-none focus:border-fg-heading transition-colors resize-none leading-relaxed"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-2xs font-light text-fg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          defaultChecked={!!phase.depositSplit}
                          onChange={e => { setPhaseField(i, { depositSplit: e.target.checked }); syncPhasesRemote() }}
                          className="w-3.5 h-3.5 accent-fg-dark"
                        />
                        Bill as 50% deposit + 50% balance (otherwise 100% on completion)
                      </label>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <p className="text-sm font-medium text-fg-heading">Phase {i + 1} — {phase.title}</p>
                        <p className="text-sm font-light text-fg-heading tabular-nums">{formatCurrency(phase.fee)}</p>
                      </div>
                      <p className="text-sm font-light text-fg-muted leading-relaxed whitespace-pre-line">{phase.scope}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {editing && (
              <button
                onClick={addPhase}
                className="mt-3 px-3 py-1.5 text-2xs font-light tracking-architectural uppercase border border-dashed border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors"
              >
                + Add phase
              </button>
            )}
          </div>

          {/* Proposal opening paragraph (shown ON the proposal page) */}
          <div className="border-t border-fg-border pt-5">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Opening paragraph (on the proposal)</p>
            <p className="text-2xs font-light text-fg-muted/60 mb-2">The personalised intro in the opening letter at the top of the proposal page</p>
            {editing ? (
              <textarea
                defaultValue={proposal.introText ?? ''}
                rows={5}
                autoFocus={focusField === 'intro'}
                onBlur={(e) => {
                  const updated: DesignProposal = { ...proposal, introText: e.target.value || undefined, updatedAt: new Date().toISOString() }
                  saveProposal(updated)
                  setProposal(updated)
                  void upsertProposal(updated)
                }}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed"
                placeholder="Thank you for the opportunity to meet on site and discuss your project..."
              />
            ) : (
              <p onClick={() => { setEditing(true); setFocusField('intro') }} title="Click to edit"
                className="text-sm font-light text-fg-heading leading-relaxed whitespace-pre-line cursor-text hover:bg-fg-card/20 -mx-1 px-1 rounded-sm transition-colors">
                {proposal.introText || <span className="text-fg-muted/40 italic">Default intro text will be used</span>}
              </p>
            )}
          </div>

          {/* Email message (shown in the delivery EMAIL — separate from the proposal intro) */}
          <div className="border-t border-fg-border pt-5">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Email message</p>
            <p className="text-2xs font-light text-fg-muted/60 mb-2">The note in the email that delivers the proposal — separate from the opening paragraph above</p>
            {editing ? (
              <textarea
                defaultValue={proposal.emailMessage ?? ''}
                rows={4}
                autoFocus={focusField === 'email'}
                onBlur={(e) => {
                  const updated: DesignProposal = { ...proposal, emailMessage: e.target.value || undefined, updatedAt: new Date().toISOString() }
                  saveProposal(updated)
                  setProposal(updated)
                  void upsertProposal(updated)
                }}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed"
                placeholder="Thank you for the opportunity to discuss your project. Your proposal is ready to view online…"
              />
            ) : (
              <p onClick={() => { setEditing(true); setFocusField('email') }} title="Click to edit"
                className="text-sm font-light text-fg-heading leading-relaxed whitespace-pre-line cursor-text hover:bg-fg-card/20 -mx-1 px-1 rounded-sm transition-colors">
                {proposal.emailMessage || <span className="text-fg-muted/40 italic">Default email message will be used</span>}
              </p>
            )}
          </div>

          {/* Program (timeline) — the "Program" box near the end of the proposal */}
          <div className="border-t border-fg-border pt-5">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Program (timeline)</p>
            <p className="text-2xs font-light text-fg-muted/60 mb-2">The &quot;Program&quot; box near the end of the proposal — how long each phase takes. Prefilled with the standard wording; edit per job.</p>
            {editing ? (
              <textarea
                defaultValue={proposal.programText ?? DEFAULT_PROGRAM_TEXT}
                rows={6}
                autoFocus={focusField === 'program'}
                onBlur={(e) => {
                  const updated: DesignProposal = { ...proposal, programText: e.target.value || undefined, updatedAt: new Date().toISOString() }
                  saveProposal(updated)
                  setProposal(updated)
                  void upsertProposal(updated)
                }}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed"
              />
            ) : (
              <p onClick={() => { setEditing(true); setFocusField('program') }} title="Click to edit"
                className="text-sm font-light text-fg-heading leading-relaxed whitespace-pre-line cursor-text hover:bg-fg-card/20 -mx-1 px-1 rounded-sm transition-colors">
                {proposal.programText || DEFAULT_PROGRAM_TEXT}
              </p>
            )}
          </div>

          {proposal.notes && (
            <div className="border-t border-fg-border pt-5">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Notes</p>
              <p className="text-sm font-light text-fg-muted leading-relaxed">{proposal.notes}</p>
            </div>
          )}

          {proposal.status === 'accepted' && (
            <div className="mt-8">
              
            {/* Proposal Videos */}
            <div className="space-y-3 mt-6">
              <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block">Proposal Videos</label>
              <input
                defaultValue={proposal.welcomeVideoUrl ?? ''}
                onBlur={(e) => saveProposalField({ welcomeVideoUrl: e.target.value.trim() || undefined })}
                className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-fg-muted/40"
                placeholder="Welcome video URL (leave blank for default)"
              />
              <input
                defaultValue={proposal.processVideoUrl ?? ''}
                onBlur={(e) => saveProposalField({ processVideoUrl: e.target.value.trim() || undefined })}
                className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors placeholder-fg-muted/40"
                placeholder="Process video URL (leave blank for default)"
              />
            </div>
            {/* Section header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-0.5">
                    Invoice Stages
                  </p>
                  <p className="text-xs font-light text-fg-muted/60">
                    Auto-generated from proposal pricing
                  </p>
                </div>
                {/* Summary: total paid / total outstanding */}
                <div className="text-right">
                  <p className="text-xs font-light text-fg-muted">
                    {formatCurrency((proposal.invoiceStages ?? []).filter(s => s.status === 'paid').reduce((sum, s) => sum + (s.amount ?? 0), 0))} paid
                    {' · '}
                    {formatCurrency((proposal.invoiceStages ?? []).filter(s => s.status !== 'paid').reduce((sum, s) => sum + (s.amount ?? 0), 0))} outstanding
                  </p>
                </div>
              </div>

              {/* Stages table */}
              <div className="border border-fg-border divide-y divide-fg-border">
                {(proposal.invoiceStages ?? []).map((stage) => (
                  <div key={stage.id} className="flex items-center gap-4 px-5 py-4">
                    {/* Stage info */}
                    <div className="flex-1">
                      <p className="text-xs font-light text-fg-heading">{stage.name}</p>
                      <p className="text-2xs text-fg-muted mt-0.5">{stage.percentage}% of Phase {stage.phase}</p>
                    </div>

                    {/* Amount */}
                    <p className="text-sm font-light tabular-nums text-fg-heading w-24 text-right">
                      {formatCurrency(stage.amount)}
                    </p>

                    {/* Status + action */}
                    <div className="flex items-center gap-2 w-40 justify-end">
                      {stage.status === 'not_sent' && (
                        <button
                          onClick={() => sendInvoice(stage.id)}
                          className="px-3 py-1.5 bg-fg-dark text-white/80 text-xs font-light tracking-wide uppercase hover:bg-fg-darker transition-colors"
                        >
                          Send Invoice
                        </button>
                      )}
                      {stage.status === 'sent' && (
                        <>
                          <span className="text-2xs text-amber-600 font-medium">Sent</span>
                          <button
                            onClick={() => markPaid(stage.id)}
                            className="px-2 py-1 border border-fg-border text-fg-muted text-2xs uppercase hover:text-fg-heading transition-colors"
                          >
                            Mark Paid
                          </button>
                        </>
                      )}
                      {stage.status === 'paid' && (
                        <span className="text-2xs text-green-600 font-medium">✓ Paid</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* GST note */}
              <p className="text-2xs text-fg-muted mt-3">
                All amounts are ex. GST. Add 10% GST when invoicing.
              </p>
            </div>
          )}

          {/* Potential Build Value + expected construction — INTERNAL (never shown to the client);
              feed the office design list and the Master Programme's design-pipeline tier. */}
          <div className="border-t border-fg-border pt-5">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">
              Potential Build Value <span className="normal-case text-fg-muted/50">(internal)</span>
            </p>
            {editing ? (
              <input
                type="number"
                min="0"
                step="1000"
                defaultValue={proposal.potentialBuildValue ?? ''}
                onBlur={(e) => saveProposalField({ potentialBuildValue: e.target.value ? parseFloat(e.target.value) : undefined })}
                className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading"
                placeholder="e.g. 450000"
              />
            ) : (
              <p className="text-sm font-light text-fg-heading tabular-nums">
                {proposal.potentialBuildValue && proposal.potentialBuildValue > 0
                  ? formatCurrency(proposal.potentialBuildValue)
                  : <span className="text-fg-muted/40 italic">Not set</span>}
              </p>
            )}

            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mt-4 mb-2">
              Expected Construction <span className="normal-case text-fg-muted/50">(rough, internal)</span>
            </p>
            {editing ? (
              <input
                type="date"
                defaultValue={proposal.expectedConstruction ?? ''}
                onBlur={(e) => saveProposalField({ expectedConstruction: e.target.value || undefined })}
                className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading"
              />
            ) : (
              <p className="text-sm font-light text-fg-heading">
                {proposal.expectedConstruction
                  ? new Date(proposal.expectedConstruction).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
                  : <span className="text-fg-muted/40 italic">Not set</span>}
              </p>
            )}
            <p className="text-2xs text-fg-muted/60 mt-1.5">Places this job on the Programme&apos;s design-pipeline row. Not visible to the client.</p>
          </div>
        </div>
      )}

      {/* ── Content blocks tab ── */}
      {tab === 'content' && (
        <div className="max-w-xl space-y-6">
          <p className="text-xs font-light text-fg-muted leading-relaxed">
            Add videos or text blocks that appear in the client-facing proposal. Use this to embed project videos, welcome messages, or notes about your process.
          </p>
          <ContentBlockEditor blocks={contentBlocks} onChange={setContentBlocks} />
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveBlocks}
              className="flex items-center gap-2 px-5 py-2 bg-fg-dark text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors"
            >
              {blocksSaved ? <><Check className="w-3 h-3" /> Saved</> : 'Save Content Blocks'}
            </button>
          </div>
        </div>
      )}

      {/* ── Preview tab ── */}
      {tab === 'preview' && (
        <div className="max-w-4xl">
          <ProposalPreview
            clientName={proposal.clientName}
            clientName2={proposal.clientName2}
            programText={proposal.programText}
            projectAddress={proposal.projectAddress}
            introText={proposal.introText}
            phases={getProposalPhases(proposal)}
            validUntil={proposal.validUntil}
            welcomeVideoUrl={proposal.welcomeVideoUrl}
            processVideoUrl={proposal.processVideoUrl}
            editable
            onPhaseChange={(i, patch) => { setPhaseField(i, patch); syncPhasesRemote() }}
          />
          <div className="mt-4">
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 text-xs font-light tracking-wide uppercase text-fg-muted hover:text-fg-heading transition-colors"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'Link copied!' : 'Copy client acceptance link'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
