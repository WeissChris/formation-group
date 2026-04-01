'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadProposals, saveProposal, deleteProposal, generateRevenueFromProposal, generateInvoiceStages, saveDesignProject, loadDesignProjectByProposalId } from '@/lib/storage'
import { formatCurrency, generateId } from '@/lib/utils'
import type { DesignProposal, ProposalContentBlock, DesignProject } from '@/types'
import { Trash2, Copy, Check, Pencil } from 'lucide-react'
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

  useEffect(() => {
    const p = loadProposals().find(p => p.id === id)
    if (!p) return router.push('/design')
    setContentBlocks(p.contentBlocks ?? [])
    if (p.status === 'accepted' && (!p.invoiceStages || p.invoiceStages.length === 0)) {
      const stages = generateInvoiceStages(p)
      const withStages = { ...p, invoiceStages: stages }
      saveProposal(withStages)
      setProposal(withStages)
    } else {
      setProposal(p)
    }
  }, [id, router])

  if (!proposal) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  const total = proposal.phase1Fee + proposal.phase2Fee + (proposal.phase3Fee ?? 0)

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

  const handleUpdateStatus = (status: DesignProposal['status']) => {
    const updated: DesignProposal = {
      ...proposal,
      status,
      ...(status === 'accepted' && !proposal.acceptedAt ? { acceptedAt: new Date().toISOString() } : {}),
    }
    saveProposal(updated)
    if (status === 'accepted') {
      generateRevenueFromProposal(updated)
      // Create design project if doesn't exist
      const existingProject = loadDesignProjectByProposalId(updated.id)
      if (!existingProject) {
        const p1DueDate = new Date()
        p1DueDate.setDate(p1DueDate.getDate() + 42)
        const designProject: DesignProject = {
          id: generateId(),
          proposalId: updated.id,
          clientName: updated.clientName,
          projectAddress: updated.projectAddress || '',
          entity: 'design',
          phase1Fee: updated.phase1Fee,
          phase1Status: 'not_started',
          phase1DueDate: p1DueDate.toISOString().split('T')[0],
          phase1DepositPaid: false,
          phase2Fee: updated.phase2Fee,
          phase2Status: 'not_started',
          phase3Fee: updated.phase3Fee,
          phase3Status: updated.phase3Fee ? 'not_started' : undefined,
          totalFee: updated.phase1Fee + updated.phase2Fee + (updated.phase3Fee || 0),
          totalPaid: 0,
          totalOutstanding: updated.phase1Fee + updated.phase2Fee + (updated.phase3Fee || 0),
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          acceptedAt: updated.acceptedAt,
        }
        saveDesignProject(designProject)
      }
    }
    setProposal(updated)
  }

  const handleDelete = () => {
    if (!confirm('Delete this proposal?')) return
    deleteProposal(id)
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
            onClick={() => setEditing(e => !e)}
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

          {[
            { label: 'Phase 1', fee: proposal.phase1Fee, scope: proposal.phase1Scope },
            { label: 'Phase 2', fee: proposal.phase2Fee, scope: proposal.phase2Scope },
            ...(proposal.phase3Fee ? [{ label: 'Phase 3', fee: proposal.phase3Fee, scope: proposal.phase3Scope ?? '' }] : []),
          ].map(phase => (
            <div key={phase.label} className="border-t border-fg-border pt-5">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">{phase.label}</p>
                <p className="text-sm font-light text-fg-heading tabular-nums">{formatCurrency(phase.fee)}</p>
              </div>
              <p className="text-sm font-light text-fg-heading leading-relaxed">{phase.scope}</p>
            </div>
          ))}

          {/* Intro Text */}
          <div className="border-t border-fg-border pt-5">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Introduction Text</p>
            <p className="text-2xs font-light text-fg-muted/60 mb-2">Personalised intro shown on the client-facing proposal</p>
            {editing ? (
              <textarea
                defaultValue={proposal.introText ?? ''}
                rows={5}
                onBlur={(e) => {
                  const updated: DesignProposal = { ...proposal, introText: e.target.value || undefined, updatedAt: new Date().toISOString() }
                  saveProposal(updated)
                  setProposal(updated)
                }}
                className="w-full px-3 py-2.5 bg-transparent border border-fg-border text-fg-heading text-sm font-light rounded-none outline-none focus:border-fg-heading transition-colors resize-none placeholder-fg-muted/40 leading-relaxed"
                placeholder="Thank you for the opportunity to meet on site and discuss your project..."
              />
            ) : (
              <p className="text-sm font-light text-fg-heading leading-relaxed whitespace-pre-line">
                {proposal.introText || <span className="text-fg-muted/40 italic">Default intro text will be used</span>}
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

          {/* Potential Build Value */}
          <div className="border-t border-fg-border pt-5">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">Potential Build Value</p>
            {editing ? (
              <input
                type="number"
                min="0"
                step="1000"
                defaultValue={proposal.potentialBuildValue ?? ''}
                onBlur={(e) => {
                  const val = e.target.value ? parseFloat(e.target.value) : undefined
                  const updated: DesignProposal = { ...proposal, potentialBuildValue: val, updatedAt: new Date().toISOString() }
                  saveProposal(updated)
                  setProposal(updated)
                }}
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
            projectAddress={proposal.projectAddress}
            introText={proposal.introText}
            phase1Scope={proposal.phase1Scope}
            phase1Fee={proposal.phase1Fee}
            phase2Scope={proposal.phase2Scope}
            phase2Fee={proposal.phase2Fee}
            phase3Scope={proposal.phase3Scope}
            phase3Fee={proposal.phase3Fee}
            validUntil={proposal.validUntil}
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
