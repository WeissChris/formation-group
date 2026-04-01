'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadDesignProjects, saveDesignProject } from '@/lib/storage'
import { formatCurrency } from '@/lib/utils'
import type { DesignProject } from '@/types'
import { Check } from 'lucide-react'

type PhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'invoiced' | 'paid'

const STATUS_OPTIONS: { value: PhaseStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete',    label: 'Complete' },
  { value: 'invoiced',    label: 'Invoiced' },
  { value: 'paid',        label: 'Paid' },
]

function formatDateDisplay(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function DateInput({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">
        {label}
      </label>
      <input
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-xs font-light outline-none focus:border-fg-dark transition-colors"
      />
    </div>
  )
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value?: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-transparent border border-fg-border text-fg-heading text-xs font-light outline-none focus:border-fg-dark transition-colors placeholder-fg-muted/50"
      />
    </div>
  )
}

function StatusSelect({ value, onChange }: { value: PhaseStatus; onChange: (v: PhaseStatus) => void }) {
  return (
    <div>
      <label className="text-2xs font-light tracking-architectural uppercase text-fg-muted block mb-1">Status</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value as PhaseStatus)}
        className="w-full px-3 py-2 bg-fg-bg border border-fg-border text-fg-heading text-xs font-light outline-none focus:border-fg-dark transition-colors"
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function DesignProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [project, setProject] = useState<DesignProject | null>(null)
  const [saved, setSaved] = useState(false)
  const [saveTimer, setSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const all = loadDesignProjects()
    const p = all.find(p => p.id === id)
    if (!p) return router.push('/design')
    setProject(p)
  }, [id, router])

  const autoSave = useCallback((updated: DesignProject) => {
    if (saveTimer) clearTimeout(saveTimer)
    const timer = setTimeout(() => {
      saveDesignProject({ ...updated, updatedAt: new Date().toISOString() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 500)
    setSaveTimer(timer)
  }, [saveTimer])

  const updateField = useCallback((field: keyof DesignProject, value: unknown) => {
    setProject(prev => {
      if (!prev) return prev
      const patch = { [field]: value } as Partial<DesignProject>
      // Auto-suggest Phase 2 due date when Phase 1 due date is set
      if (field === 'phase1DueDate' && value && !prev.phase2DueDate) {
        const p2Date = new Date(value as string)
        p2Date.setDate(p2Date.getDate() + 28)
        patch.phase2DueDate = p2Date.toISOString().split('T')[0]
      }
      const updated = { ...prev, ...patch }
      // Recalculate financials
      const p1Paid = updated.phase1Status === 'paid' ? updated.phase1Fee : 0
      const p2Paid = updated.phase2Status === 'paid' ? updated.phase2Fee : 0
      const p3Paid = (updated.phase3Status === 'paid' && updated.phase3Fee) ? updated.phase3Fee : 0
      updated.totalPaid = p1Paid + p2Paid + p3Paid
      updated.totalOutstanding = updated.totalFee - updated.totalPaid
      autoSave(updated)
      return updated
    })
  }, [autoSave])

  const update = useCallback((patch: Partial<DesignProject>) => {
    setProject(prev => {
      if (!prev) return prev
      const updated = { ...prev, ...patch }
      // Recalculate financials
      const p1Paid = updated.phase1Status === 'paid' ? updated.phase1Fee : 0
      const p2Paid = updated.phase2Status === 'paid' ? updated.phase2Fee : 0
      const p3Paid = (updated.phase3Status === 'paid' && updated.phase3Fee) ? updated.phase3Fee : 0
      updated.totalPaid = p1Paid + p2Paid + p3Paid
      updated.totalOutstanding = updated.totalFee - updated.totalPaid
      autoSave(updated)
      return updated
    })
  }, [autoSave])

  if (!project) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-12">
        <p className="text-sm font-light text-fg-muted">Loading…</p>
      </div>
    )
  }

  const paidPercent = project.totalFee > 0 ? Math.round((project.totalPaid / project.totalFee) * 100) : 0
  const phase1Deposit = Math.round(project.phase1Fee * 0.5)
  const phase1Balance = project.phase1Fee - phase1Deposit

  return (
    <div className="max-w-[1200px] mx-auto px-6 lg:px-10 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-8 text-xs font-light text-fg-muted">
        <Link href="/design" className="hover:text-fg-heading transition-colors">Design</Link>
        <span>/</span>
        <span className="text-fg-heading">{project.clientName}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-fg-heading">{project.clientName}</h1>
          <p className="text-sm font-light text-fg-muted">{project.projectAddress}</p>
          {project.acceptedAt && (
            <p className="text-xs font-light text-fg-muted mt-1">
              Accepted {formatDateDisplay(project.acceptedAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs font-light text-green-600">
              <Check className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
        </div>
      </div>

      {/* Phase cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mt-8 mb-8">
        {/* Phase 1 Card */}
        <div className="border border-fg-border p-6 space-y-4">
          <div>
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Phase 1</p>
            <p className="text-sm font-semibold text-fg-heading">Concept Design</p>
            <p className="text-base font-light text-fg-heading tabular-nums mt-1">{formatCurrency(project.phase1Fee)}</p>
          </div>

          <StatusSelect
            value={project.phase1Status}
            onChange={v => update({ phase1Status: v })}
          />

          <DateInput
            label="Due Date"
            value={project.phase1DueDate}
            onChange={v => updateField('phase1DueDate', v)}
          />

          <DateInput
            label="Completed"
            value={project.phase1CompletedDate}
            onChange={v => update({ phase1CompletedDate: v })}
          />

          {/* Deposit section */}
          <div className="border-t border-fg-border pt-4 space-y-3">
            <div>
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">
                Deposit (50% = {formatCurrency(phase1Deposit)})
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={project.phase1DepositPaid}
                  onChange={e => update({ phase1DepositPaid: e.target.checked })}
                  className="w-4 h-4 accent-fg-dark"
                />
                <span className="text-xs font-light text-fg-heading">Deposit received</span>
              </label>
            </div>
            {project.phase1DepositPaid && (
              <>
                <DateInput
                  label="Deposit Date"
                  value={project.phase1DepositDate}
                  onChange={v => update({ phase1DepositDate: v })}
                />
                <TextInput
                  label="Invoice #"
                  value={project.phase1InvoiceNumber}
                  onChange={v => update({ phase1InvoiceNumber: v })}
                  placeholder="e.g. INV-0042"
                />
              </>
            )}
          </div>

          {/* Balance section */}
          <div className="border-t border-fg-border pt-4 space-y-3">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">
              Balance ({formatCurrency(phase1Balance)})
            </p>
            <DateInput
              label="Balance Paid Date"
              value={project.phase1PaidDate}
              onChange={v => update({ phase1PaidDate: v })}
            />
            <DateInput
              label="Invoiced Date"
              value={project.phase1InvoicedDate}
              onChange={v => update({ phase1InvoicedDate: v })}
            />
          </div>
        </div>

        {/* Phase 2 Card */}
        {project.phase2Fee > 0 && (
          <div className="border border-fg-border p-6 space-y-4">
            <div>
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Phase 2</p>
              <p className="text-sm font-semibold text-fg-heading">Design Development</p>
              <p className="text-base font-light text-fg-heading tabular-nums mt-1">{formatCurrency(project.phase2Fee)}</p>
            </div>

            <StatusSelect
              value={project.phase2Status}
              onChange={v => update({ phase2Status: v })}
            />

            <DateInput
              label="Due Date"
              value={project.phase2DueDate}
              onChange={v => update({ phase2DueDate: v })}
            />

            <DateInput
              label="Completed"
              value={project.phase2CompletedDate}
              onChange={v => update({ phase2CompletedDate: v })}
            />

            <div className="border-t border-fg-border pt-4 space-y-3">
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">
                Payment (100% on completion)
              </p>
              <TextInput
                label="Invoice #"
                value={project.phase2InvoiceNumber}
                onChange={v => update({ phase2InvoiceNumber: v })}
                placeholder="e.g. INV-0043"
              />
              <DateInput
                label="Invoiced Date"
                value={project.phase2InvoicedDate}
                onChange={v => update({ phase2InvoicedDate: v })}
              />
              <DateInput
                label="Paid Date"
                value={project.phase2PaidDate}
                onChange={v => update({ phase2PaidDate: v })}
              />
            </div>
          </div>
        )}

        {/* Phase 3 Card (optional) */}
        {project.phase3Fee && project.phase3Fee > 0 && (
          <div className="border border-fg-border p-6 space-y-4">
            <div>
              <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Phase 3</p>
              <p className="text-sm font-semibold text-fg-heading">Administration</p>
              <p className="text-base font-light text-fg-heading tabular-nums mt-1">{formatCurrency(project.phase3Fee)}</p>
            </div>

            <StatusSelect
              value={project.phase3Status || 'not_started'}
              onChange={v => update({ phase3Status: v })}
            />

            <DateInput
              label="Due Date"
              value={project.phase3DueDate}
              onChange={v => update({ phase3DueDate: v })}
            />

            <DateInput
              label="Paid Date"
              value={project.phase3PaidDate}
              onChange={v => update({ phase3PaidDate: v })}
            />
          </div>
        )}
      </div>

      {/* Financial Summary */}
      <div className="border border-fg-border p-6 mb-8">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-6">Financial Summary</p>

        <div className="space-y-3 mb-6">
          <div className="flex justify-between items-center border-b border-fg-border pb-3">
            <span className="text-sm font-light text-fg-muted">Total Fee</span>
            <span className="text-sm font-light text-fg-heading tabular-nums">{formatCurrency(project.totalFee)}</span>
          </div>
          <div className="flex justify-between items-center border-b border-fg-border pb-3">
            <span className="text-sm font-light text-fg-muted">Total Paid</span>
            <span className="text-sm font-light text-fg-heading tabular-nums">
              {formatCurrency(project.totalPaid)}{' '}
              <span className="text-fg-muted">({paidPercent}%)</span>
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-fg-heading">Outstanding</span>
            <span className="text-sm font-semibold text-fg-heading tabular-nums">{formatCurrency(project.totalOutstanding)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-fg-border rounded-full h-2">
          <div
            className="bg-fg-dark h-2 rounded-full transition-all duration-500"
            style={{ width: `${paidPercent}%` }}
          />
        </div>
        <p className="text-2xs font-light text-fg-muted mt-2">{paidPercent}% collected</p>
      </div>

      {/* Notes */}
      <div className="border border-fg-border p-6">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-3">Notes</p>
        <textarea
          value={project.notes || ''}
          onChange={e => update({ notes: e.target.value })}
          placeholder="Add notes about this project…"
          rows={4}
          className="w-full bg-transparent text-fg-heading text-sm font-light outline-none resize-none placeholder-fg-muted/50"
        />
      </div>
    </div>
  )
}
