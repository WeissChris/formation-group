'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadEstimates, saveEstimate, loadProposals } from '@/lib/storage'
import { getEstimates, upsertEstimate } from '@/lib/storageAsync'
import { getEstimateTotals } from '@/lib/estimateCalculations'
import { requestSendVariation, sendErrorMessage } from '@/lib/emailClient'
import { formatCurrency } from '@/lib/utils'
import type { Estimate } from '@/types'

export default function VariationSendPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [cc, setCc] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sentOk, setSentOk] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let est = loadEstimates().find(e => e.id === id)
      if (!est) { est = (await getEstimates()).find(e => e.id === id); if (est) saveEstimate(est) }
      if (cancelled) return
      if (!est) { router.push('/estimates'); return }
      if (!est.parentEstimateId) { router.push(`/estimates/${id}`); return } // base estimates use Quote, not Send
      setEstimate(est)
      setMessage(est.sendMessage || '')
      // Resolve client name + email from the linked design proposal (this estimate's, or the parent's).
      const proposalId = est.proposalId || loadEstimates().find(e => e.id === est!.parentEstimateId)?.proposalId
      const proposal = proposalId ? loadProposals().find(p => p.id === proposalId) : null
      if (proposal) {
        setClientName(proposal.clientName || '')
        if (proposal.clientEmail) setClientEmail(proposal.clientEmail)
        if (proposal.ccEmails) setCc(proposal.ccEmails)
      }
    })()
    return () => { cancelled = true }
  }, [id, router])

  if (!estimate) return <div className="max-w-2xl mx-auto px-6 py-16 text-sm font-light text-fg-muted">Loading…</div>

  const totals = getEstimateTotals(estimate)
  const label = `Variation${estimate.variationNumber ? ` VMO-${estimate.variationNumber}` : ''}`
  const publicUrl = estimate.acceptanceToken && typeof window !== 'undefined'
    ? `${window.location.origin}/variation/${estimate.acceptanceToken}` : ''

  const handleSend = async () => {
    if (estimate.status === 'accepted') { alert('This variation has already been approved by the client.'); return }
    if (!clientEmail.trim()) { alert('Add the client email address first.'); return }
    if (!confirm(`Send ${label} to ${clientEmail} for approval?`)) return
    setSending(true)
    const token = estimate.acceptanceToken
      || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`)
    const updated: Estimate = { ...estimate, acceptanceToken: token, sendMessage: message, status: 'sent', sentAt: new Date().toISOString() }
    await upsertEstimate(updated) // local + Supabase, so the public approval page can read it
    setEstimate(updated)
    const res = await requestSendVariation({
      clientName: clientName || estimate.projectName,
      clientEmail: clientEmail.trim(),
      acceptanceToken: token,
      variationLabel: label,
      projectAddress: estimate.projectName,
      amountLabel: `${totals.totalRevenue >= 0 ? '+' : ''}${formatCurrency(totals.totalRevenue)} + GST`,
      message,
      ccEmails: cc,
    })
    setSending(false)
    if (res.ok) { setSentOk(true); alert(`${label} sent to ${clientEmail} for approval.`) }
    else alert(`Saved, but the email couldn't be sent: ${sendErrorMessage(res.error)}\n\nYou can try again.`)
  }

  const inputCls = 'w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-sm font-light outline-none focus:border-fg-heading transition-colors'

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="flex items-center gap-2 mb-6 text-xs font-light text-fg-muted">
        <Link href={`/estimates/${id}`} className="hover:text-fg-heading transition-colors">← Back to variation</Link>
      </div>

      <h1 className="text-xl font-light tracking-wide text-fg-heading">Send {label}</h1>
      <p className="text-sm font-light text-fg-muted mt-1">{estimate.projectName}</p>

      <div className="grid grid-cols-3 gap-px bg-fg-border border border-fg-border mt-6">
        {[
          { label: 'Subtotal (ex GST)', value: formatCurrency(totals.totalRevenue) },
          { label: 'GST', value: formatCurrency(totals.gst) },
          { label: 'Total', value: formatCurrency(totals.totalIncGst) },
        ].map(s => (
          <div key={s.label} className="bg-fg-bg px-4 py-3">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{s.label}</p>
            <p className="text-sm font-light text-fg-heading tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Client email</label>
          <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@example.com" className={inputCls} />
        </div>
        <div>
          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">CC (optional)</label>
          <input value={cc} onChange={e => setCc(e.target.value)} placeholder="another@example.com" className={inputCls} />
        </div>
        <div>
          <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Message to the client</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5}
            placeholder="A short note describing the variation and asking them to review and approve it online…"
            className={`${inputCls} resize-none leading-relaxed`} />
          <p className="text-2xs text-fg-muted/60 mt-1">This appears in the email and on the approval page. Leave blank for a default note.</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={handleSend} disabled={sending || estimate.status === 'accepted'}
          className="px-6 py-2.5 bg-fg-dark text-white/90 text-xs font-light tracking-architectural uppercase hover:bg-fg-darker transition-colors disabled:opacity-50">
          {sending ? 'Sending…' : estimate.status === 'accepted' ? 'Approved' : estimate.status === 'sent' || sentOk ? 'Resend for approval' : 'Send for approval'}
        </button>
        {(estimate.status === 'sent' || sentOk) && estimate.status !== 'accepted' && (
          <span className="text-2xs text-blue-400/80 uppercase tracking-wide">Sent</span>
        )}
        {estimate.status === 'accepted' && (
          <span className="text-2xs text-green-500/90 uppercase tracking-wide">✓ Approved by {estimate.acceptedByName || 'client'}</span>
        )}
      </div>

      {publicUrl && (
        <div className="mt-6 border border-fg-border/50 bg-fg-card/20 px-4 py-3">
          <p className="text-2xs text-fg-muted uppercase tracking-wide mb-1">Approval link</p>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-fg-heading hover:underline break-all">{publicUrl}</a>
        </div>
      )}
    </div>
  )
}
