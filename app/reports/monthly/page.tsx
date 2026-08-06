'use client'

// Monthly Finance Report - the one-click pack for the monthly finance meeting.
// Assembles the month in review (invoiced by entity + trend), FY budget vs actual, the company
// P&L (month + FYTD), the live jobs table, pipeline, debtors ageing and FY closeouts - all from
// the existing metric libs so every figure agrees with the dashboard and /reports.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatCurrency, toISODate, getFinancialYear } from '@/lib/utils'
import { loadLiveJobs, type LoadedLiveJobs } from '@/lib/loadLiveJobs'
import { loadProjects, loadGanttEntries, loadProgressClaims, loadProgressPaymentStages, loadWeeklyRevenue, loadProposals } from '@/lib/storage'
import { computeUnbilledWork } from '@/lib/unbilledWork'
import { xeroSalesExtra, unmatchedXeroSales } from '@/lib/xeroSales'
import { computeDebtors, type DebtorSummary } from '@/lib/debtors'
import { scheduleStatus } from '@/lib/projectHealth'
import { getProposalPhases, phasesTotal } from '@/lib/proposalPhases'
import {
  fyStartYearOf, fyLabelOf, fyRangeIso, fyElapsedPct, computeBudgetProgress,
  type CompanyBudget, type BudgetProgress,
} from '@/lib/companyBudget'
import type { CompanyPnlMonth } from '@/lib/companyPnl'
import {
  monthIsoOf, addMonths, monthLabel, inMonth, monthlyInvoiced, invoicedTrend,
  pnlMonthTotals, pnlFyTotals, type InvoicedItem, type ReportEntity,
} from '@/lib/monthlyReport'
import type { LiveJobRow } from '@/lib/liveJobs'
import type { CloseoutRow } from '@/app/api/projects/closeouts/route'

const STATUS_LABEL: Record<LiveJobRow['status'], string> = {
  on_target: 'On target', watch: 'Watch', below_target: 'Below target',
}
const STATUS_COLOR: Record<LiveJobRow['status'], string> = {
  on_target: 'text-green-600', watch: 'text-amber-500', below_target: 'text-red-500',
}
const ENTITY_LABEL: Record<ReportEntity, string> = {
  formation: 'Formation Landscapes', lume: 'Lume Pools', design: 'Design',
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="mt-8" style={{ breakInside: 'avoid' }}>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted">{title}</p>
        {note && <p className="text-2xs font-light text-fg-muted">{note}</p>}
      </div>
      {children}
    </div>
  )
}

export default function MonthlyReportPage() {
  const [monthIso, setMonthIso] = useState(() => monthIsoOf(new Date()))
  const [data, setData] = useState<LoadedLiveJobs | null>(null)
  const [items, setItems] = useState<InvoicedItem[]>([])
  const [unbilledByProject, setUnbilledByProject] = useState<Map<string, number>>(new Map())
  const [claimsSentCount, setClaimsSentCount] = useState(0)
  const [plannedNextMonth, setPlannedNextMonth] = useState(0)
  const [budget, setBudget] = useState<CompanyBudget | null>(null)
  const [pnlMonths, setPnlMonths] = useState<CompanyPnlMonth[]>([])
  const [debtors, setDebtors] = useState<DebtorSummary | null>(null)
  const [closeouts, setCloseouts] = useState<CloseoutRow[]>([])
  const [generatedAt, setGeneratedAt] = useState('')

  const now = new Date()
  const todayIso = toISODate(now)
  const fyStart = fyStartYearOf(now)
  const fyLabel = getFinancialYear(now)

  useEffect(() => {
    loadLiveJobs().then(d => {
      setData(d)
      const todayIso2 = toISODate(new Date())
      const map = new Map<string, number>()
      const extras: InvoicedItem[] = []
      for (const [pid, api] of Array.from(d.apiById.entries())) {
        const claims = loadProgressClaims(pid)
        const sales = (api.sales ?? []).map(s => ({ invoiceNumber: s.invoice_number, totalEx: s.total_ex_gst, dateIso: s.invoice_date ?? '' }))
        const entity = (d.projectsById.get(pid)?.entity ?? 'formation') as ReportEntity
        for (const u of unmatchedXeroSales(sales, claims)) {
          extras.push({ entity, dateIso: u.dateIso, amount: u.totalEx })
        }
        const gantt = loadGanttEntries(pid)
        if (gantt.length > 0) {
          map.set(pid, computeUnbilledWork(gantt, claims, todayIso2, xeroSalesExtra(sales, claims)).unbilled)
        }
      }
      setUnbilledByProject(map)
      // One invoiced list from both billing sources: claim-written revenue rows + Xero extras.
      const revenueItems: InvoicedItem[] = loadWeeklyRevenue()
        .filter(r => (r.actualInvoiced ?? 0) > 0)
        .map(r => ({ entity: r.entity as ReportEntity, dateIso: r.weekEnding, amount: r.actualInvoiced ?? 0 }))
      setItems([...revenueItems, ...extras])
    })
    const projects = loadProjects()
    setDebtors(computeDebtors(projects, loadProgressClaims(), projects.flatMap(p => loadProgressPaymentStages(p.id)), toISODate(new Date())))
    fetch(`/api/company/budget?fy=${fyStartYearOf(new Date())}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b?.budget) setBudget(b.budget as CompanyBudget) })
      .catch(() => {})
    fetch('/api/company/pnl', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b?.months) setPnlMonths(b.months as CompanyPnlMonth[]) })
      .catch(() => {})
    fetch('/api/projects/closeouts', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.closeouts) setCloseouts(d.closeouts) })
      .catch(() => {})
    setGeneratedAt(new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))
  }, [])

  // Month-dependent slices (cheap - recompute on nav).
  useEffect(() => {
    const nextMonth = addMonths(monthIso, 1)
    setClaimsSentCount(loadProgressClaims().filter(c =>
      (c.status === 'sent' || c.status === 'paid') && c.sentAt && inMonth(c.sentAt.slice(0, 10), monthIso)
    ).length)
    setPlannedNextMonth(loadWeeklyRevenue()
      .filter(r => inMonth(r.weekEnding, nextMonth))
      .reduce((s, r) => s + r.plannedRevenue, 0))
  }, [monthIso])

  const thisMonth = monthlyInvoiced(items, monthIso)
  const prevMonth = monthlyInvoiced(items, addMonths(monthIso, -1))
  const trend = invoicedTrend(items, monthIso, 6)
  const trendMax = Math.max(...trend.map(t => t.total), 1)

  // FY budget vs actual - claim-written invoiced rows + Xero extras, planned-forward from today.
  const { fromIso, toIso } = fyRangeIso(fyStart)
  const fyItems = items.filter(it => it.dateIso >= fromIso && it.dateIso <= toIso)
  const revenue = typeof window !== 'undefined' ? loadWeeklyRevenue() : []
  const ENTITY_DEFS: Array<{ entity: ReportEntity; target: (b: CompanyBudget) => number }> = [
    { entity: 'formation', target: b => b.revenueTargetFormation },
    { entity: 'lume', target: b => b.revenueTargetLume },
    { entity: 'design', target: b => b.revenueTargetDesign },
  ]
  const budgetRows: Array<{ label: string } & BudgetProgress> = budget
    ? ENTITY_DEFS.map(def => {
        const invoiced = fyItems.filter(it => it.entity === def.entity).reduce((s, it) => s + it.amount, 0)
        const plannedRemaining = revenue
          .filter(r => r.entity === def.entity && getFinancialYear(new Date(r.weekEnding)) === fyLabel && r.weekEnding >= todayIso)
          .reduce((s, r) => s + r.plannedRevenue, 0)
        return { label: ENTITY_LABEL[def.entity], ...computeBudgetProgress(def.target(budget), invoiced, plannedRemaining) }
      })
    : []
  const budgetTotal = budget
    ? computeBudgetProgress(
        budgetRows.reduce((s, r) => s + r.target, 0),
        budgetRows.reduce((s, r) => s + r.invoicedToDate, 0),
        budgetRows.reduce((s, r) => s + r.plannedRemaining, 0),
      )
    : null
  const fyElapsed = fyElapsedPct(fyStart, todayIso) * 100
  const hasBudget = budgetTotal !== null && budgetTotal.target > 0

  const pnlMonth = pnlMonthTotals(pnlMonths, monthIso)
  const pnlFytd = pnlFyTotals(pnlMonths, fyStart, monthIso)

  // Pipeline - same formulas as the dashboard Design card.
  const proposals = typeof window !== 'undefined' ? loadProposals() : []
  const pendingProposals = proposals.filter(p => (p.status === 'sent' || p.status === 'pending') && !p.archived)
  const acceptedProposals = proposals.filter(p => p.status === 'accepted')
  const closedProposals = proposals.filter(p => p.status === 'accepted' || p.status === 'lost' || p.status === 'declined')
  const pendingValue = pendingProposals.reduce((s, p) => s + phasesTotal(getProposalPhases(p)) * 1.1, 0)
  const winRate = closedProposals.length > 0 ? Math.round((acceptedProposals.length / closedProposals.length) * 100) : null

  const rows = data?.rows ?? []
  const totals = data?.totals
  const belowTarget = rows.filter(r => r.status === 'below_target')
  const fyCloseouts = closeouts.filter(c => c.closedAt >= fromIso && c.closedAt <= toIso)

  const delta = thisMonth.total - prevMonth.total

  return (
    <div className="max-w-[1100px] mx-auto px-6 lg:px-10 py-8">
      <style>{`@media print { .mfr-section { break-inside: avoid; } }`}</style>

      {/* Header */}
      <div className="flex items-start justify-between mb-2 flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-light text-fg-heading">Monthly Finance Report</h1>
          <p className="text-xs font-light text-fg-muted mt-1">
            {monthLabel(monthIso)} · {fyLabelOf(fyStart)} · Generated {generatedAt || '…'}
            {data?.lastSyncedAt && ` · Xero synced ${new Date(data.lastSyncedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button onClick={() => setMonthIso(m => addMonths(m, -1))} className="px-3 py-1.5 text-2xs font-light border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors">&larr; Prev</button>
          <button onClick={() => setMonthIso(m => addMonths(m, 1))} className="px-3 py-1.5 text-2xs font-light border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors">Next &rarr;</button>
          <Link href="/reports" className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-border text-fg-muted hover:text-fg-heading hover:border-fg-heading transition-colors">Portfolio report</Link>
          <button onClick={() => window.print()} className="px-3 py-1.5 text-2xs font-light tracking-wide uppercase border border-fg-heading text-fg-heading hover:bg-fg-heading hover:text-white transition-colors">Print / Save PDF</button>
        </div>
      </div>

      {/* ── The month in review ── */}
      <div className="mfr-section grid grid-cols-2 md:grid-cols-4 gap-px bg-fg-border mt-6">
        <div className="bg-fg-bg p-4">
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Invoiced this month</p>
          <p className="text-lg font-light tabular-nums text-fg-heading">{formatCurrency(thisMonth.total)}</p>
          <p className={`text-2xs font-light tabular-nums mt-0.5 ${delta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {delta >= 0 ? '+' : ''}{formatCurrency(delta)} vs {monthLabel(addMonths(monthIso, -1)).split(' ')[0]}
          </p>
        </div>
        {(['formation', 'lume', 'design'] as ReportEntity[]).map(e => (
          <div key={e} className="bg-fg-bg p-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{ENTITY_LABEL[e]}</p>
            <p className="text-lg font-light tabular-nums text-fg-heading">{formatCurrency(thisMonth.byEntity[e])}</p>
            <p className="text-2xs font-light tabular-nums text-fg-muted/70 mt-0.5">{formatCurrency(prevMonth.byEntity[e])} last month</p>
          </div>
        ))}
        <div className="bg-fg-bg p-4">
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Invoices sent</p>
          <p className="text-lg font-light tabular-nums text-fg-heading">{claimsSentCount}</p>
          <p className="text-2xs font-light text-fg-muted/70 mt-0.5">progress claims this month</p>
        </div>
        <div className="bg-fg-bg p-4">
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Planned next month</p>
          <p className="text-lg font-light tabular-nums text-fg-heading">{formatCurrency(plannedNextMonth)}</p>
          <p className="text-2xs font-light text-fg-muted/70 mt-0.5">scheduled revenue, {monthLabel(addMonths(monthIso, 1))}</p>
        </div>
        <div className="bg-fg-bg p-4 col-span-2">
          <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-2">6-month invoiced trend</p>
          <div className="flex items-end gap-2 h-12">
            {trend.map(t => (
              <div key={t.monthIso} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-fg-dark/70 rounded-sm" style={{ height: `${Math.max(3, (t.total / trendMax) * 40)}px` }} />
                <span className="text-[9px] font-light text-fg-muted">{monthLabel(t.monthIso).slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FY budget vs actual ── */}
      {hasBudget && budgetTotal && (
        <Section title={`Budget vs actual - ${fyLabelOf(fyStart)}`} note={`${fyElapsed.toFixed(0)}% of the year elapsed`}>
          <div className="border border-fg-border divide-y divide-fg-border">
            {[...budgetRows.filter(r => r.target > 0), { label: 'Total', ...budgetTotal }].map(row => {
              const invoicedPct = row.target > 0 ? Math.min(100, (row.invoicedToDate / row.target) * 100) : 0
              const projPct = row.target > 0 ? Math.min(100, (row.projection / row.target) * 100) : 0
              const behind = (row.pctOfTarget ?? 100) < 100
              return (
                <div key={row.label} className="px-5 py-3">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className={`text-xs font-light ${row.label === 'Total' ? 'font-medium text-fg-heading' : 'text-fg-heading'}`}>{row.label}</span>
                    <span className="text-xs font-light tabular-nums">
                      <span className="text-fg-muted">{formatCurrency(row.invoicedToDate)} invoiced + {formatCurrency(row.plannedRemaining)} scheduled = {formatCurrency(row.projection)}</span>
                      <span className={`ml-3 font-medium ${behind ? 'text-amber-600' : 'text-green-600'}`}>
                        {row.pctOfTarget === null ? '—' : `${row.pctOfTarget.toFixed(0)}% of ${formatCurrency(row.target)}`}
                      </span>
                    </span>
                  </div>
                  <div className="relative h-2 bg-fg-border rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-fg-dark/30" style={{ width: `${projPct}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-fg-dark" style={{ width: `${invoicedPct}%` }} />
                    <div className="absolute inset-y-0 w-px bg-fg-heading" style={{ left: `${Math.min(100, fyElapsed)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-2xs font-light text-fg-muted/70 mt-2">
            Solid = invoiced to date; faded = projection with scheduled work; marker = where the year is up to. A projection short of 100% means selling is needed to make budget.
          </p>
        </Section>
      )}

      {/* ── Company P&L ── */}
      {(pnlMonth || pnlFytd) && (
        <Section title="Company P&L" note="Whole-company Xero P&L - the only overhead / net profit view">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                <th className="py-2 pr-3"></th>
                <th className="py-2 px-2 text-right">Revenue</th>
                <th className="py-2 px-2 text-right">Cost of sales</th>
                <th className="py-2 px-2 text-right">Gross profit</th>
                <th className="py-2 px-2 text-right">GP %</th>
                <th className="py-2 px-2 text-right">Overheads</th>
                <th className="py-2 pl-2 text-right">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: monthLabel(monthIso), t: pnlMonth },
                { label: `${fyLabelOf(fyStart)} to date`, t: pnlFytd },
              ].filter(r => r.t).map(({ label, t }) => (
                <tr key={label} className="border-b border-fg-border/30">
                  <td className="py-2 pr-3 text-xs font-light text-fg-heading">{label}</td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(t!.revenue)}</td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(t!.costOfSales)}</td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(t!.grossProfit)}</td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{t!.revenue > 0 ? `${((t!.grossProfit / t!.revenue) * 100).toFixed(1)}%` : '—'}</td>
                  <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(t!.overheads)}</td>
                  <td className={`py-2 pl-2 text-right text-xs tabular-nums font-medium ${t!.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatCurrency(t!.netProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── Live jobs ── */}
      <Section title="Live jobs" note={totals ? `${totals.jobCount} active · forecast GP ${totals.forecastGpPct.toFixed(1)}%` : undefined}>
        {!data ? <p className="text-sm font-light text-fg-muted">Loading…</p> : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                <th className="py-2 pr-3">Job</th>
                <th className="py-2 px-2 text-right">Contract</th>
                <th className="py-2 px-2 text-right">Invoiced</th>
                <th className="py-2 px-2 text-right">Unbilled</th>
                <th className="py-2 px-2 text-right">Cost to date</th>
                <th className="py-2 px-2 text-right">GP %</th>
                <th className="py-2 px-2 text-right">Schedule</th>
                <th className="py-2 pl-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const proj = data.projectsById.get(r.projectId)
                const sched = proj ? scheduleStatus(proj, loadGanttEntries(r.projectId)) : { status: 'green' as const, daysSlippage: null }
                return (
                  <tr key={r.projectId} className="border-b border-fg-border/30">
                    <td className="py-2 pr-3 text-xs font-light text-fg-heading">{r.projectName}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(r.forecastRevenue)}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{formatCurrency(r.invoicedToDate)} <span className="text-2xs">({r.pctBilled.toFixed(0)}%)</span></td>
                    <td className={`py-2 px-2 text-right text-xs tabular-nums ${(unbilledByProject.get(r.projectId) ?? 0) > 0 ? 'text-amber-600' : 'text-fg-muted'}`}>
                      {unbilledByProject.has(r.projectId) ? formatCurrency(unbilledByProject.get(r.projectId)!) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{r.hasLiveCostData ? formatCurrency(r.costToDate) : '—'}</td>
                    <td className={`py-2 px-2 text-right text-xs tabular-nums ${r.hasLiveCostData ? STATUS_COLOR[r.status] : 'text-fg-muted/40'}`}>{r.hasLiveCostData ? `${r.forecastGpPct.toFixed(1)}%` : '—'}</td>
                    <td className={`py-2 px-2 text-right text-xs tabular-nums ${sched.daysSlippage === null ? 'text-fg-muted/40' : sched.status === 'green' ? 'text-green-600' : sched.status === 'amber' ? 'text-amber-500' : 'text-red-500'}`}>
                      {sched.daysSlippage === null ? '—' : sched.daysSlippage <= 0 ? 'On time' : `${sched.daysSlippage}d behind`}
                    </td>
                    <td className={`py-2 pl-2 text-right text-2xs font-medium uppercase ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {belowTarget.length > 0 && (
          <div className="border border-red-200 bg-red-50/40 p-4 mt-4">
            <p className="text-2xs font-semibold tracking-architectural uppercase text-red-600 mb-1.5">Needs attention - below target margin</p>
            <ul className="space-y-0.5">
              {belowTarget.map(r => (
                <li key={r.projectId} className="text-xs font-light text-fg-heading">
                  {r.projectName} - forecast GP {r.forecastGpPct.toFixed(1)}% ({r.fadePpts.toFixed(1)} pts vs {r.quotedMarginPct.toFixed(0)}% quote)
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* ── Pipeline ── */}
      <Section title="Pipeline">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-fg-border">
          <div className="bg-fg-bg p-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Proposals pending</p>
            <p className="text-base font-light tabular-nums text-fg-heading">{pendingProposals.length} · {formatCurrency(pendingValue)}</p>
          </div>
          <div className="bg-fg-bg p-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Win rate</p>
            <p className="text-base font-light tabular-nums text-fg-heading">{winRate !== null ? `${winRate}% (${acceptedProposals.length}/${closedProposals.length})` : '—'}</p>
          </div>
          <div className="bg-fg-bg p-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Unbilled work</p>
            <p className="text-base font-light tabular-nums text-fg-heading">
              {formatCurrency(Array.from(unbilledByProject.values()).reduce((s, v) => s + v, 0))}
            </p>
          </div>
          <div className="bg-fg-bg p-4">
            <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">Debtors outstanding</p>
            <p className="text-base font-light tabular-nums text-fg-heading">{debtors ? formatCurrency(debtors.totalOutstanding) : '—'}</p>
          </div>
        </div>
      </Section>

      {/* ── Debtors ageing ── */}
      {debtors && debtors.invoices.length > 0 && (
        <Section title="Debtors ageing" note={debtors.avgDaysToPay !== null ? `Clients average ${debtors.avgDaysToPay} days to pay` : undefined}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-fg-border">
            {debtors.buckets.map((b, i) => (
              <div key={b.label} className="bg-fg-bg p-4">
                <p className="text-2xs font-light tracking-architectural uppercase text-fg-muted mb-1">{b.label}</p>
                <p className={`text-base font-light tabular-nums ${b.amount > 0 && i >= 2 ? 'text-red-500' : b.amount > 0 && i === 1 ? 'text-amber-600' : 'text-fg-heading'}`}>{formatCurrency(b.amount)}</p>
                <p className="text-2xs font-light text-fg-muted/70 mt-0.5">{b.count} invoice{b.count === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Completed this FY ── */}
      {fyCloseouts.length > 0 && (
        <Section title={`Completed jobs - ${fyLabelOf(fyStart)}`} note="Quoted vs final margin">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-fg-border text-2xs font-light tracking-architectural uppercase text-fg-muted">
                <th className="py-2 pr-3">Job</th>
                <th className="py-2 px-2 text-right">Completed</th>
                <th className="py-2 px-2 text-right">Final revenue</th>
                <th className="py-2 px-2 text-right">Quoted GP %</th>
                <th className="py-2 px-2 text-right">Final GP %</th>
                <th className="py-2 pl-2 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {fyCloseouts.map(c => {
                const variance = c.finalGpPct - c.quotedMarginPct
                return (
                  <tr key={c.projectId} className="border-b border-fg-border/30">
                    <td className="py-2 pr-3 text-xs font-light text-fg-heading">{c.name}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{new Date(`${c.closedAt}T00:00:00`).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{formatCurrency(c.finalRevenue)}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-muted">{c.quotedMarginPct.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums text-fg-heading">{c.finalGpPct.toFixed(1)}%</td>
                    <td className={`py-2 pl-2 text-right text-xs tabular-nums font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>{variance >= 0 ? '+' : ''}{variance.toFixed(1)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  )
}
