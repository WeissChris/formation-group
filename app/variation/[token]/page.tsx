'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getVariationByToken, approveVariationByToken, rejectVariationByToken } from '@/lib/publicData'
import { getEstimateTotals, readLineItemRevenue, getEstimateContract, lineContractValue } from '@/lib/estimateCalculations'
import { formatCurrency } from '@/lib/utils'
import type { Estimate } from '@/types'

export default function VariationApprovalPage() {
  const params = useParams()
  const token = params.token as string
  const [variation, setVariation] = useState<Estimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const v = await getVariationByToken(token)
      if (cancelled) return
      setVariation(v)
      setLoading(false)
      if (v?.status === 'accepted') setDone('approved')
      else if (v?.status === 'declined') setDone('rejected')
    })()
    return () => { cancelled = true }
  }, [token])

  const handleApprove = async () => {
    if (!name.trim()) { alert('Please type your name to approve.'); return }
    setBusy(true)
    const res = await approveVariationByToken(token, name.trim())
    setBusy(false)
    if (res) { setVariation(res); setDone('approved') }
    else alert('Sorry, we could not record your approval. Please try again or contact us.')
  }

  const handleReject = async () => {
    if (!name.trim()) { alert('Please type your name first.'); return }
    if (!confirm('Reject this variation?')) return
    setBusy(true)
    const res = await rejectVariationByToken(token, name.trim())
    setBusy(false)
    if (res) { setVariation(res); setDone('rejected') }
    else alert('Sorry, we could not record your response. Please try again.')
  }

  if (loading) return <div className="min-h-screen bg-[#eceae7] flex items-center justify-center text-[#8A8580] text-sm font-light">Loading…</div>
  if (!variation) return <div className="min-h-screen bg-[#eceae7] flex items-center justify-center text-[#8A8580] text-sm font-light px-6 text-center">This variation link is invalid or has expired.</div>

  const totals = getEstimateTotals(variation)
  const contract = getEstimateContract(variation)
  const label = `Variation${variation.variationNumber ? ` VMO-${variation.variationNumber}` : ''}`
  const activeLines = variation.lineItems.filter(i => i.enabled !== false)

  return (
    <div className="min-h-screen bg-[#eceae7] py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white border border-[#e7e4df] p-8 sm:p-12">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#3D5A3A] font-medium mb-2">Formation Landscapes</p>
        <h1 className="text-2xl font-light text-[#1a1a1a]">{label} for your approval</h1>
        <p className="text-sm text-[#8A8580] mt-1">{variation.projectName}</p>
        {variation.variationReason && <p className="text-sm text-[#2d2d2d] mt-3">{variation.variationReason}</p>}
        {variation.sendMessage && <p className="text-sm text-[#2d2d2d] mt-4 whitespace-pre-line leading-relaxed">{variation.sendMessage}</p>}

        <table className="w-full mt-7 text-sm">
          <thead>
            <tr className="border-b border-[#e7e4df] text-[11px] uppercase tracking-wide text-[#8A8580]">
              <th className="text-left py-2 font-medium">Description</th>
              <th className="text-right py-2 font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {activeLines.map(li => (
              <tr key={li.id} className="border-b border-[#eeeae5]">
                <td className="py-2 text-[#1a1a1a]">{li.description || '—'}</td>
                <td className="py-2 text-right tabular-nums text-[#1a1a1a]">{formatCurrency(lineContractValue(li, contract))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex flex-col items-end gap-1 text-sm">
          <div className="flex justify-between w-52"><span className="text-[#8A8580]">Subtotal (ex GST)</span><span className="tabular-nums">{formatCurrency(totals.totalRevenue)}</span></div>
          <div className="flex justify-between w-52"><span className="text-[#8A8580]">GST</span><span className="tabular-nums">{formatCurrency(totals.gst)}</span></div>
          <div className="flex justify-between w-52 font-medium border-t border-[#e7e4df] pt-1"><span>Total</span><span className="tabular-nums">{formatCurrency(totals.totalIncGst)}</span></div>
        </div>

        {done === 'approved' ? (
          <div className="mt-8 border border-green-600/30 bg-green-50 p-5 text-center">
            <p className="text-base font-light text-green-700">✓ Variation approved</p>
            <p className="text-sm text-[#2d2d2d] mt-1">Thank you{variation.acceptedByName ? `, ${variation.acceptedByName}` : ''} — we&#39;ll proceed with this variation.</p>
          </div>
        ) : done === 'rejected' ? (
          <div className="mt-8 border border-[#e7e4df] bg-[#f6f4f1] p-5 text-center">
            <p className="text-base font-light text-[#1a1a1a]">Variation declined</p>
            <p className="text-sm text-[#2d2d2d] mt-1">Thanks for letting us know — we&#39;ll be in touch.</p>
          </div>
        ) : (
          <div className="mt-8 border-t border-[#e7e4df] pt-6">
            <label className="text-[11px] uppercase tracking-wide text-[#8A8580] block mb-1">Your name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Type your full name to approve"
              className="w-full px-3 py-2 border border-[#d8d4ce] text-[#1a1a1a] text-sm outline-none focus:border-[#3D5A3A] mb-4" />
            <div className="flex gap-3 flex-wrap">
              <button onClick={handleApprove} disabled={busy} className="px-6 py-2.5 bg-[#3D5A3A] text-white text-sm tracking-wide disabled:opacity-50 hover:bg-[#324a30] transition-colors">{busy ? 'Saving…' : 'Approve variation'}</button>
              <button onClick={handleReject} disabled={busy} className="px-5 py-2.5 border border-[#d8d4ce] text-[#8A8580] text-sm hover:text-[#1a1a1a] transition-colors">Reject</button>
            </div>
          </div>
        )}
        <p className="text-xs text-[#b3aea7] mt-8">Questions? Reply to the email or contact Formation Landscapes.</p>
      </div>
    </div>
  )
}
