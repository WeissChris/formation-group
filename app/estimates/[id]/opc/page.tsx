'use client'

// Opinion of Probable Cost - the preliminary-pricing document sent before formal quoting.
// Styled in the Design Fee proposal language (hero cover, Formation green, warm cards).
//
// Rows are first-class: a row can MERGE several estimate categories into one client-facing line
// (all the in-situ concrete scopes as one item) - its price is the members' combined contract
// value rounded to the nearest $100. Scope prose lives on the row, written inline or inserted
// from the shared snippet library (fg_opc_snippets, cross-device via liveSync). Edits autosave.

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadEstimates, loadProjects, loadProposals, saveEstimate, loadOpcSnippets } from '@/lib/storage'
import { getEstimates, upsertEstimate, getOpcSnippets, upsertOpcSnippet, deleteOpcSnippetAsync } from '@/lib/storageAsync'
import { formatCurrency, generateId } from '@/lib/utils'
import { activeLineItems, getEstimateContract, itemsContractValue } from '@/lib/estimateCalculations'
import type { Estimate, EstimateOpc, OpcRow, OpcSnippet } from '@/types'
import { Printer, ArrowLeft, X, Plus, ChevronDown, Bold, Italic, List } from 'lucide-react'
import SpellCheckButton from '@/components/SpellCheckButton'

const GREEN = '#3D5A3A'
const HEADING = '#1a1a1a'
const BODY = '#2d2d2d'
const MUTED = '#6b6b6b'
const BG_WARM = '#F0EEEB'
const HERO_IMAGE = '/proposal-hero-8.jpg'

const round100 = (n: number) => Math.round(n / 100) * 100

const DEFAULT_EXCLUSIONS: { title: string; blurb: string }[] = [
  { title: 'Electrical Works', blurb: '240V electrical and licensed plumbing work is excluded from all scopes.' },
  { title: 'Excavation', blurb: 'No allowance has been made for bulk excavation unless specifically noted in a scope.' },
  { title: 'LPOD Connections', blurb: 'Light grading of subsurface and drain installation only - no LPOD (Legal Point of Discharge) connections. These are usually provided by the house plumber.' },
]

function defaultIntro(projectName: string, hasPool: boolean): string {
  return `This document presents the Opinion of Probable Cost (OPC) for the ${projectName} project, prepared by Formation. It covers ${
    hasPool ? 'both the landscape construction estimate and the pool & spa build quote' : 'the landscape construction estimate'}.`
}

/** Fold the estimate's current categories into the saved row layout: vanished categories drop out,
 *  new ones append as their own row (scope seeded from the template's opcScopes when present). */
function reconcileRows(saved: OpcRow[] | undefined, categories: string[], seeds: Record<string, string>): OpcRow[] {
  const rows: OpcRow[] = []
  const seen = new Set<string>()
  for (const r of saved ?? []) {
    const cats = r.categories.filter(c => categories.includes(c) && !seen.has(c))
    cats.forEach(c => seen.add(c))
    if (cats.length > 0) rows.push({ ...r, categories: cats })
  }
  for (const c of categories) {
    if (!seen.has(c)) rows.push({ id: generateId(), title: c, categories: [c], scope: seeds[c] ?? '' })
  }
  return rows
}

// ── Rich prose (bold / italics / dot points) ──────────────────────────────────────
// Scope text is stored as a light HTML fragment. Legacy plain-text values (and plain snippet
// text) convert on the way in; stripProse() gives back plain text for spell check and previews.

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain text -> HTML fragment (idempotent: existing HTML passes straight through). */
function toHtml(value: string): string {
  if (!value) return ''
  if (/<(br|p|ul|ol|li|strong|b|em|i|div)\b/i.test(value)) return value
  return escapeHtml(value).replace(/\n/g, '<br>')
}

/** HTML fragment -> plain text (for spell check + snippet previews). */
function stripProse(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

const joinProse = (a: string, b: string) =>
  stripProse(a).trim() ? `${toHtml(a)}<br>${toHtml(b)}` : toHtml(b)

/** contentEditable prose field: formatting toolbar (bold / italic / bullets) appears on focus,
 *  prints exactly as styled. Uncontrolled while focused so the caret never jumps. */
function ProseField({ value, onChange, placeholder, className = '' }: {
  value: string; onChange: (v: string) => void; placeholder: string; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  // Track what WE last emitted: a value prop that differs is an EXTERNAL change (spell-check
  // replace, snippet insert) and must sync into the editor even mid-focus - otherwise the stale
  // DOM content wins on the next blur and silently reverts the fix.
  const lastEmitted = useRef<string | null>(null)
  const html = toHtml(value)
  useEffect(() => {
    if (!ref.current) return
    if (html === lastEmitted.current) return   // our own edit echoing back through state
    if (ref.current.innerHTML !== html) ref.current.innerHTML = html
  }, [html])

  const emit = () => {
    const h = ref.current?.innerHTML ?? ''
    lastEmitted.current = h
    onChange(h)
  }
  const exec = (command: string) => {
    document.execCommand(command)
    emit()
  }

  return (
    <div className="relative">
      {focused && (
        <div className="print:hidden absolute -top-8 left-0 z-10 flex items-center bg-white border border-gray-200 shadow-sm">
          {/* onMouseDown + preventDefault keeps the text selection alive through the click */}
          <button onMouseDown={e => { e.preventDefault(); exec('bold') }} title="Bold" className="px-2.5 py-1 hover:bg-gray-100 transition-colors">
            <Bold className="w-3 h-3 text-gray-600" />
          </button>
          <button onMouseDown={e => { e.preventDefault(); exec('italic') }} title="Italic" className="px-2.5 py-1 hover:bg-gray-100 transition-colors border-l border-gray-100">
            <Italic className="w-3 h-3 text-gray-600" />
          </button>
          <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }} title="Dot points" className="px-2.5 py-1 hover:bg-gray-100 transition-colors border-l border-gray-100">
            <List className="w-3 h-3 text-gray-600" />
          </button>
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); emit() }}
        onInput={emit}
        data-placeholder={placeholder}
        className={`opc-prose w-full outline-none border border-transparent hover:border-gray-300 focus:border-gray-400 print:border-0 transition-colors ${className}`}
      />
    </div>
  )
}

/** "Insert scope ▾" - the snippet library dropdown on each row (insert / save-current / delete). */
function SnippetMenu({ snippets, currentText, onInsert, onSaveCurrent, onDelete }: {
  snippets: OpcSnippet[]
  currentText: string
  onInsert: (text: string) => void
  onSaveCurrent: () => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="print:hidden relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-2 py-0.5 transition-colors"
      >
        Insert scope <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-0 mt-1 w-80 max-h-72 overflow-y-auto bg-white border border-gray-200 shadow-lg">
            {snippets.length === 0 && (
              <p className="px-3 py-2.5 text-2xs text-gray-400">No saved scopes yet - write one below and save it.</p>
            )}
            {snippets.map(s => (
              <div key={s.id} className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 group">
                <button onClick={() => { onInsert(s.text); setOpen(false) }} className="flex-1 text-left">
                  <p className="text-xs font-normal text-gray-800">{s.title}</p>
                  <p className="text-2xs text-gray-400 line-clamp-2">{stripProse(s.text)}</p>
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  title="Delete from library"
                  className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => { onSaveCurrent(); setOpen(false) }}
              disabled={!currentText.trim()}
              className="w-full flex items-center gap-1.5 px-3 py-2.5 text-2xs text-gray-500 hover:text-gray-800 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3 h-3" /> Save this row&apos;s text to the library
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function OpcPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [opc, setOpc] = useState<EstimateOpc | null>(null)
  const [snippets, setSnippets] = useState<OpcSnippet[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let found = loadEstimates().find(e => e.id === id)
      if (!found) {
        found = (await getEstimates()).find(e => e.id === id)
        if (found) saveEstimate(found)
      }
      if (cancelled) return
      if (!found) { router.push('/estimates'); return }
      setEstimate(found)
      const hasPool = found.projectType === 'landscape_and_pool' || found.projectType === 'pool_only'
      const active = activeLineItems(found)
      const categories = Array.from(new Set(active.map(i => i.category).filter(Boolean)))
      setOpc({
        date: found.opc?.date ?? new Date().toISOString().slice(0, 10),
        intro: found.opc?.intro ?? defaultIntro(found.name || found.projectName || 'client', hasPool),
        rows: reconcileRows(found.opc?.rows, categories, found.opc?.scopes ?? {}),
        scopes: found.opc?.scopes ?? {},
        poolSubtotalExGst: found.opc?.poolSubtotalExGst ?? null,
        exclusions: found.opc?.exclusions ?? DEFAULT_EXCLUSIONS,
        excludedItems: found.opc?.excludedItems ?? [],
      })

      const p = loadProjects().find(p => p.id === found.projectId)
      const linkedProposal = found.proposalId ? loadProposals().find(pr => pr.id === found.proposalId) : null
      setClientName(p?.clientName || linkedProposal?.clientName || found.clientName || found.projectName || 'Client')
      setClientAddress(p?.address || linkedProposal?.projectAddress || found.projectAddress || '')

      // Snippet library: local copy immediately, then the cloud copy (covers a fresh device).
      setSnippets(loadOpcSnippets())
      getOpcSnippets().then(remote => {
        if (cancelled || remote.length === 0) return
        setSnippets(local => {
          const byId = new Map(local.map(s => [s.id, s]))
          for (const r of remote) {
            const l = byId.get(r.id)
            if (!l || (Date.parse(r.updatedAt || '') || 0) >= (Date.parse(l.updatedAt || '') || 0)) byId.set(r.id, r)
          }
          return Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title))
        })
      }).catch(() => { /* offline - local list stands */ })
    })()
    return () => { cancelled = true }
  }, [id, router])

  // Debounced autosave of the OPC data onto the estimate (local + Supabase), flushed on leave.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<EstimateOpc | null>(null)
  const estimateRef = useRef<Estimate | null>(null)
  estimateRef.current = estimate
  const mutate = (patch: Partial<EstimateOpc>) => {
    setOpc(prev => {
      const next = { ...(prev ?? {}), ...patch }
      pendingRef.current = next
      setSaveState('saving')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const est = estimateRef.current
        if (!est) return
        pendingRef.current = null
        const updated = { ...est, opc: next, updatedAt: new Date().toISOString() }
        setEstimate(updated)
        void upsertEstimate(updated).then(() => setSaveState('saved'))
      }, 800)
      return next
    })
  }
  useEffect(() => {
    const flush = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null }
      const est = estimateRef.current
      if (pendingRef.current && est) {
        void upsertEstimate({ ...est, opc: pendingRef.current, updatedAt: new Date().toISOString() })
        pendingRef.current = null
      }
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush); flush() }
  }, [])

  if (!estimate || !opc) return (
    <div className="max-w-[1200px] mx-auto px-6 py-12">
      <p className="text-sm font-light text-fg-muted">Loading…</p>
    </div>
  )

  const active = activeLineItems(estimate)
  const contract = getEstimateContract(estimate)
  const rows = opc.rows ?? []
  const priceOf = (row: OpcRow) =>
    round100(itemsContractValue(active.filter(i => row.categories.includes(i.category)), contract))

  const setRow = (rowId: string, patch: Partial<OpcRow>) =>
    mutate({ rows: rows.map(r => r.id === rowId ? { ...r, ...patch } : r) })

  /** Merge a row into a target: categories combine, scope text concatenates, source row goes. */
  const mergeInto = (sourceId: string, targetId: string) => {
    const source = rows.find(r => r.id === sourceId)
    const target = rows.find(r => r.id === targetId)
    if (!source || !target) return
    mutate({
      rows: rows
        .filter(r => r.id !== sourceId)
        .map(r => r.id === targetId
          ? { ...r, categories: [...r.categories, ...source.categories], scope: joinProse(r.scope, source.scope) }
          : r),
    })
  }

  /** Eject a category out of a merged row back to its own line. */
  const ejectCategory = (rowId: string, category: string) => {
    const row = rows.find(r => r.id === rowId)
    if (!row || row.categories.length < 2) return
    const next = rows.map(r => r.id === rowId ? { ...r, categories: r.categories.filter(c => c !== category) } : r)
    next.push({ id: generateId(), title: category, categories: [category], scope: '' })
    mutate({ rows: next })
  }

  // Click-to-fix from the spell check panel: swap every whole-word occurrence across the
  // document's prose (intro, row titles + scopes, exclusions, items). Scope fields hold HTML,
  // so the swap runs on the fragment - a word split by a formatting tag stays put (rare; the
  // checker will flag it again and it can be fixed in the field).
  const replaceWord = (word: string, replacement: string) => {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    const swap = (s: string) => s.replace(re, replacement)
    mutate({
      intro: swap(opc.intro ?? ''),
      rows: rows.map(r => ({ ...r, title: swap(r.title), scope: swap(r.scope) })),
      exclusions: (opc.exclusions ?? []).map(ex => ({ title: swap(ex.title), blurb: swap(ex.blurb) })),
      excludedItems: (opc.excludedItems ?? []).map(swap),
    })
  }

  const saveSnippet = (row: OpcRow) => {
    const title = window.prompt('Library title for this scope text:', row.title)
    if (!title || !title.trim()) return
    const snippet: OpcSnippet = { id: generateId(), title: title.trim(), text: row.scope }
    void upsertOpcSnippet(snippet)
    setSnippets(prev => [...prev, snippet].sort((a, b) => a.title.localeCompare(b.title)))
  }
  const removeSnippet = (snippetId: string) => {
    if (!window.confirm('Remove this scope from the library?')) return
    void deleteOpcSnippetAsync(snippetId)
    setSnippets(prev => prev.filter(s => s.id !== snippetId))
  }

  // The document must add up for the client: the landscape subtotal is the SUM OF THE ROUNDED ROWS.
  const landscapeExGst = rows.reduce((s, r) => s + priceOf(r), 0)
  const poolExGst = opc.poolSubtotalExGst ?? 0
  const hasPoolFigure = poolExGst > 0
  // Pool bands (and the landscape/pool/combined breakdown) only exist on pool projects, or when
  // an older OPC already carries a pool figure. Landscape-only jobs get one total band.
  const poolRelevant = estimate.projectType === 'landscape_and_pool' || estimate.projectType === 'pool_only' || hasPoolFigure
  const combinedExGst = landscapeExGst + poolExGst
  const money = (n: number) => formatCurrency(n)

  const docDate = opc.date ? new Date(opc.date) : new Date()
  const dateLabel = docDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  const exclusions = opc.exclusions ?? []
  const excludedItems = opc.excludedItems ?? []

  return (
    <div className="min-h-screen bg-white" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <style>{`
        .opc-prose { min-height: 1.5em; }
        .opc-prose:empty::before { content: attr(data-placeholder); color: #9ca3af; }
        .opc-prose ul { list-style: disc; padding-left: 1.4em; margin: 0.25em 0; }
        .opc-prose ol { list-style: decimal; padding-left: 1.4em; margin: 0.25em 0; }
        @media print {
          .opc-cover { height: 25cm; break-after: page; }
          .opc-avoid-break { break-inside: avoid; }
          .opc-prose:empty::before { content: ''; }
        }
      `}</style>

      {/* Toolbar (hidden in print) */}
      <div className="print:hidden bg-fg-darker px-6 py-3 flex items-center justify-between">
        <Link
          href={`/estimates/${estimate.id}`}
          className="flex items-center gap-2 text-xs font-light tracking-wide uppercase text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Estimate
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-2xs text-white/40 w-14">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}</span>
          <SpellCheckButton
            getTexts={() => [
              stripProse(opc.intro ?? ''),
              ...rows.flatMap(r => [r.title, stripProse(r.scope)]),
              ...(opc.exclusions ?? []).flatMap(ex => [ex.title, stripProse(ex.blurb)]),
              ...(opc.excludedItems ?? []),
            ]}
            onReplace={replaceWord}
          />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-1.5 bg-white/10 text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-white/20 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* ── COVER ── */}
      <div className="opc-cover relative h-[70vh] min-h-[480px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 55%' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.1) 100%)' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/formation-logo-white.svg" alt="Formation" className="absolute top-8 left-10 h-6 w-auto" />
        <div className="absolute bottom-12 left-10 right-10">
          <p className="text-white/60 text-xs tracking-[0.25em] uppercase mb-3">Preliminary Pricing</p>
          <h1 className="text-white font-light leading-tight mb-4" style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', letterSpacing: '0.01em' }}>
            Opinion of Probable Cost
          </h1>
          <p className="text-white/90 font-light text-xl mb-1">{clientName}</p>
          {clientAddress && <p className="text-white/70 font-light text-base">{clientAddress}</p>}
          <input
            type="date"
            value={opc.date ?? ''}
            onChange={e => mutate({ date: e.target.value })}
            className="print:hidden mt-3 bg-transparent text-white/60 text-sm font-light border border-white/20 px-2 py-0.5 rounded-none outline-none [color-scheme:dark]"
          />
          <p className="hidden print:block text-white/60 text-sm font-light mt-3">{dateLabel}</p>
        </div>
      </div>

      <div className="max-w-[860px] mx-auto px-8 py-14 print:px-0 print:py-10">
        {/* Intro */}
        <div className="mb-14">
          <ProseField
            value={opc.intro ?? ''}
            onChange={v => mutate({ intro: v })}
            placeholder="Intro paragraph…"
            className="text-lg font-light leading-relaxed"
          />
        </div>

        {/* ── LANDSCAPE CONSTRUCTION ESTIMATE ── */}
        <div className="mb-16">
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>01 — Landscape Construction Estimate</p>
          <div className="h-px w-16 mb-8" style={{ backgroundColor: GREEN }} />

          <div className="space-y-3">
            {rows.map(row => {
              const price = priceOf(row)
              const others = rows.filter(r => r.id !== row.id)
              return (
                <div key={row.id} className="opc-avoid-break rounded-lg px-6 py-5" style={{ backgroundColor: BG_WARM, borderLeft: `3px solid ${GREEN}` }}>
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <input
                        value={row.title}
                        onChange={e => setRow(row.id, { title: e.target.value })}
                        className="print:hidden w-full text-base font-normal bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-none outline-none"
                        style={{ color: HEADING }}
                      />
                      <p className="hidden print:block text-base font-normal" style={{ color: HEADING }}>{row.title}</p>
                      {row.categories.length > 1 && (
                        <div className="print:hidden mt-1.5 flex flex-wrap gap-1">
                          {row.categories.map(c => (
                            <span key={c} className="inline-flex items-center gap-1 text-2xs text-gray-500 bg-white/70 px-1.5 py-0.5">
                              {c}
                              <button onClick={() => ejectCategory(row.id, c)} title="Split back to its own row" className="text-gray-400 hover:text-red-400">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-lg font-light tabular-nums whitespace-nowrap shrink-0" style={{ color: price > 0 ? GREEN : MUTED }}>
                      {price > 0 ? money(price) : ''}
                    </p>
                  </div>
                  <div className="mt-2.5">
                    <ProseField
                      value={row.scope}
                      onChange={v => setRow(row.id, { scope: v })}
                      placeholder="Client-facing scope of works…"
                      className="text-sm font-light leading-relaxed"
                    />
                  </div>
                  <div className="print:hidden mt-2.5 flex items-center gap-2">
                    <SnippetMenu
                      snippets={snippets}
                      currentText={stripProse(row.scope)}
                      onInsert={text => setRow(row.id, { scope: joinProse(row.scope, text) })}
                      onSaveCurrent={() => saveSnippet(row)}
                      onDelete={removeSnippet}
                    />
                    {others.length > 0 && (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) mergeInto(row.id, e.target.value) }}
                        className="text-2xs text-gray-400 bg-transparent border border-gray-200 rounded-none outline-none px-1 py-0.5 max-w-[180px]"
                      >
                        <option value="">Merge into…</option>
                        {others.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── PROJECT COST SUMMARY ── */}
        <div className="mb-16 opc-avoid-break">
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>02 — Project Cost Summary</p>
          <div className="h-px w-16 mb-8" style={{ backgroundColor: GREEN }} />

          <div className="space-y-3">
            {/* Landscape-only jobs get ONE total band - the per-section + combined breakdown only
                earns its place when a pool figure joins the landscape number. */}
            {poolRelevant && (
            <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: BG_WARM }}>
              <p className="text-base font-light" style={{ color: HEADING }}>Landscape Construction</p>
              <p className="text-sm font-light tabular-nums" style={{ color: BODY }}>
                Subtotal ex. GST: <span className="font-normal">{money(landscapeExGst)}</span>
                <span className="mx-2 text-gray-300">|</span>GST: {money(landscapeExGst * 0.1)}
                <span className="mx-2 text-gray-300">|</span>Total: <span className="font-normal">{money(landscapeExGst * 1.1)}</span>
              </p>
            </div>
            )}
            {poolRelevant && (
            <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: BG_WARM }}>
              <div className="flex items-center gap-3">
                <p className="text-base font-light" style={{ color: HEADING }}>Pool &amp; Spa</p>
                <label className="print:hidden text-2xs text-gray-400 flex items-center gap-1">
                  ex GST $
                  <input
                    type="number"
                    value={opc.poolSubtotalExGst ?? ''}
                    onChange={e => mutate({ poolSubtotalExGst: e.target.value === '' ? null : parseFloat(e.target.value) || 0 })}
                    placeholder="from Lume quote"
                    className="w-28 px-1.5 py-0.5 border border-gray-300 bg-white rounded-none outline-none focus:border-gray-400 text-xs tabular-nums"
                  />
                </label>
              </div>
              <p className="text-sm font-light tabular-nums" style={{ color: BODY }}>
                {hasPoolFigure
                  ? <>Subtotal ex. GST: <span className="font-normal">{money(poolExGst)}</span>
                      <span className="mx-2 text-gray-300">|</span>GST: {money(poolExGst * 0.1)}
                      <span className="mx-2 text-gray-300">|</span>Total: <span className="font-normal">{money(poolExGst * 1.1)}</span></>
                  : <span className="print:hidden text-gray-400">enter the Lume figure to include</span>}
              </p>
            </div>
            )}
            <div className="flex items-center justify-between px-6 py-5" style={{ backgroundColor: GREEN }}>
              <p className="text-base font-normal text-white">{hasPoolFigure ? 'Combined Project Total' : 'Project Total'}</p>
              <p className="text-sm font-light text-white/90 tabular-nums">
                Ex. GST: <span className="font-normal text-white">{money(combinedExGst)}</span>
                <span className="mx-2 text-white/30">|</span>GST: {money(combinedExGst * 0.1)}
                <span className="mx-2 text-white/30">|</span>Total inc. GST: <span className="font-semibold text-white">{money(combinedExGst * 1.1)}</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── EXCLUSIONS & KEY NOTES ── */}
        <div className="mb-14 opc-avoid-break">
          <p className="text-xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>03 — Exclusions &amp; Key Notes</p>
          <div className="h-px w-16 mb-8" style={{ backgroundColor: GREEN }} />

          <p className="text-xs font-normal tracking-widest uppercase mb-4" style={{ color: MUTED }}>
            {hasPoolFigure ? 'Excluded from Both Quotes' : 'Excluded'}
          </p>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {exclusions.map((ex, i) => (
              <div key={i} className="relative group px-5 py-4" style={{ backgroundColor: BG_WARM }}>
                <button
                  onClick={() => mutate({ exclusions: exclusions.filter((_, j) => j !== i) })}
                  title="Remove" className="print:hidden absolute top-2 right-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
                <input
                  value={ex.title}
                  onChange={e => mutate({ exclusions: exclusions.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })}
                  className="print:hidden w-full text-sm font-normal bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-none outline-none mb-1.5"
                  style={{ color: HEADING }}
                />
                <p className="hidden print:block text-sm font-normal mb-1.5" style={{ color: HEADING }}>{ex.title}</p>
                <ProseField
                  value={ex.blurb}
                  onChange={v => mutate({ exclusions: exclusions.map((x, j) => j === i ? { ...x, blurb: v } : x) })}
                  placeholder="Why / what exactly is excluded…"
                  className="text-xs font-light leading-relaxed"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => mutate({ exclusions: [...exclusions, { title: 'New exclusion', blurb: '' }] })}
            className="print:hidden mb-8 flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 transition-colors">
            <Plus className="w-3 h-3" /> Add exclusion
          </button>

          <p className="text-xs font-normal tracking-widest uppercase mb-4" style={{ color: MUTED }}>Items Not Included</p>
          <div className="px-6 py-5" style={{ backgroundColor: BG_WARM }}>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {excludedItems.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm font-light" style={{ color: BODY }}>
                  <span style={{ color: GREEN }}>·</span>
                  <input
                    value={item}
                    onChange={e => mutate({ excludedItems: excludedItems.map((x, j) => j === i ? e.target.value : x) })}
                    className="print:hidden flex-1 bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-none outline-none"
                  />
                  <span className="hidden print:inline">{item}</span>
                  <button
                    onClick={() => mutate({ excludedItems: excludedItems.filter((_, j) => j !== i) })}
                    className="print:hidden text-gray-300 hover:text-red-400"><X className="w-3 h-3" /></button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => mutate({ excludedItems: [...excludedItems, ''] })}
              className="print:hidden mt-3 flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 transition-colors">
              <Plus className="w-3 h-3" /> Add item
            </button>
          </div>
        </div>

        {/* Footnote */}
        <div className="border-t border-gray-200 pt-6 pb-4">
          <p className="text-xs font-light italic" style={{ color: MUTED }}>
            This Opinion of Probable Cost is preliminary pricing prepared from the design documentation
            available at the date above. It is not a fixed-price quotation; a formal quote will follow
            once the design and scope are finalised.
          </p>
          <p className="text-2xs font-light mt-3" style={{ color: MUTED }}>
            Formation Landscapes Pty Ltd · Melbourne, Victoria
          </p>
        </div>
      </div>
    </div>
  )
}
