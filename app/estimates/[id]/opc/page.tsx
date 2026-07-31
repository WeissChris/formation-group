'use client'

// Opinion of Probable Cost - the preliminary-pricing document sent before formal quoting.
// Styled in the Design Fee proposal language (hero cover, Formation green, warm cards).
//
// Rows are first-class: a row can MERGE several estimate categories into one client-facing line
// (all the in-situ concrete scopes as one item) - its price is the members' combined contract
// value rounded to the nearest $100. Scope prose lives on the row, written inline or inserted
// from the shared snippet library (fg_opc_snippets, cross-device via liveSync). Edits autosave.

import React, { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadEstimates, loadProjects, loadProposals, saveEstimate, loadOpcSnippets } from '@/lib/storage'
import { getEstimates, upsertEstimate, getOpcSnippets, upsertOpcSnippet, deleteOpcSnippetAsync } from '@/lib/storageAsync'
import { formatCurrency, generateId } from '@/lib/utils'
import { activeLineItems, getEstimateContract, itemsContractValue, optionCategories } from '@/lib/estimateCalculations'
import type { Estimate, EstimateOpc, OpcRow, OpcRowImage, OpcSnippet } from '@/types'
import { Printer, ArrowLeft, X, Plus, ChevronDown, Bold, Italic, List, ImagePlus } from 'lucide-react'
import { uploadAttachment, attachmentUrl, deleteAttachment, safeFileName } from '@/lib/attachments'
import SpellCheckButton from '@/components/SpellCheckButton'

const GREEN = '#3D5A3A'
const HEADING = '#1a1a1a'
const BODY = '#2d2d2d'
const MUTED = '#6b6b6b'
const BG_WARM = '#F0EEEB'
const HERO_IMAGE = '/proposal-hero-8.jpg'
// The shared proposal hero set - the cover picker cycles these.
const HERO_IMAGES = Array.from({ length: 9 }, (_, i) => `/proposal-hero-${i + 1}.jpg`)
// First image the "add divider image" button drops in (different from the default cover).
const DEFAULT_DIVIDER = '/proposal-hero-3.jpg'

// Company contact details for the closing block + repeating page footer. Only non-empty lines
// render, so phone/email can be filled in once confirmed without touching the layout.
const CONTACT = {
  phone: '0402 032 690',
  email: 'Chris@formationlandscapes.com.au',
  web: 'formationlandscapes.com.au',
  abnFormation: '21 148 216 031',
  abnLume: '11 609 197 613',
}

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

function defaultQuoteIntro(projectName: string, hasPool: boolean): string {
  return `This quote is for the ${projectName} project, prepared by Formation. It covers ${
    hasPool ? 'the landscape construction works and the pool & spa build' : 'the landscape construction works'}. Pricing is fixed for the scope described and valid for 30 days from the date above.`
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

/** Fold the estimate's flagged option categories into a saved OPC option list. Auto-seeded entries
 *  (categoryRef set) track their category's priced value and drop out when the flag is removed;
 *  hand-written entries (no categoryRef) are always kept untouched. Titles/notes on seeded entries
 *  stay editable - only the dollar value is refreshed from the estimate. */
function reconcileOptions<T extends { categoryRef?: string }>(
  saved: T[] | undefined,
  flagged: { category: string; value: number }[],
  makeEntry: (category: string, value: number) => T,
  withValue: (entry: T, value: number) => T,
): T[] {
  const out: T[] = []
  const seen = new Set<string>()
  for (const e of saved ?? []) {
    if (!e.categoryRef) { out.push(e); continue }
    const match = flagged.find(f => f.category === e.categoryRef)
    if (!match) continue // flag removed in the estimate, so the auto entry goes with it
    seen.add(match.category)
    out.push(withValue(e, Math.round(match.value)))
  }
  for (const f of flagged) {
    if (!seen.has(f.category)) out.push(makeEntry(f.category, Math.round(f.value)))
  }
  return out
}

// ── Rich prose (bold / italics / dot points) ──────────────────────────────────────
// Scope text is stored as a light HTML fragment. Legacy plain-text values (and plain snippet
// text) convert on the way in; stripProse() gives back plain text for spell check and previews.

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Only these tags carry meaning in a scope block; everything else (Word's <span style>, <font>,
// <o:p>, class/style attributes) is presentational junk that overrides the card's own type. Strip
// it so pasted-from-Word text renders in the document's style, not Century Gothic 10pt black.
const ALLOWED_PROSE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV'])
function sanitizeProse(html: string): string {
  if (typeof document === 'undefined' || !html) return html
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === 8) { node.removeChild(child); return }   // strip comments (Word cond.)
      if (child.nodeType !== 1) return
      const el = child as HTMLElement
      walk(el)
      if (ALLOWED_PROSE_TAGS.has(el.tagName)) {
        Array.from(el.attributes).forEach(a => el.removeAttribute(a.name))   // drop style/class/lang
      } else {
        while (el.firstChild) node.insertBefore(el.firstChild, el)           // unwrap span/font/o:p
        node.removeChild(el)
      }
    })
  }
  walk(tmp)
  return tmp.innerHTML
}

/** Plain text -> HTML fragment (idempotent), sanitised so stored/pasted junk never wins. */
function toHtml(value: string): string {
  if (!value) return ''
  // The value is ALREADY HTML if it carries a tag OR an HTML entity (a trailing space becomes
  // &nbsp;); only genuine plain-text seeds (estimate defaults, snippet library) need escaping.
  // Testing for tags alone re-escaped an entity-only fragment every round-trip: &nbsp; -> &amp;nbsp;
  // -> &amp;amp;nbsp;, which surfaced as the literal "All&amp;nbsp;" in the editor.
  const looksHtml = /<[a-z/!]/i.test(value) || /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(value)
  const html = looksHtml ? value : escapeHtml(value).replace(/\n/g, '<br>')
  return sanitizeProse(html)
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
        onPaste={e => {
          // Intercept the paste so Word/web styling never enters the field - insert clean HTML.
          e.preventDefault()
          const cd = e.clipboardData
          const rawHtml = cd.getData('text/html')
          const clean = rawHtml ? sanitizeProse(rawHtml) : escapeHtml(cd.getData('text/plain')).replace(/\n/g, '<br>')
          document.execCommand('insertHTML', false, clean)
          emit()
        }}
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
  // Signed display URLs for scope-card photos, keyed by attachment path (paths only in the data).
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({})
  // A4 page guides: dashed lines where the print will break, so a photo's fit is visible while
  // editing. Guide mode narrows the body to the exact print width so heights match the paper.
  const [showGuides, setShowGuides] = useState(true)
  const [guideYs, setGuideYs] = useState<number[]>([])
  const bodyRef = useRef<HTMLDivElement>(null)

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
      // Render as an OPC or a formal Quote - the ?doc=quote link (from the estimate's Quote button)
      // wins, else whatever was last saved, else OPC.
      const docParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('doc') : null
      const docType: 'opc' | 'quote' = (docParam === 'quote' ? 'quote' : (found.opc?.docType as 'opc' | 'quote' | undefined)) ?? 'opc'
      const projName = found.name || found.projectName || 'client'
      setOpc({
        date: found.opc?.date ?? new Date().toISOString().slice(0, 10),
        intro: found.opc?.intro ?? (docType === 'quote' ? defaultQuoteIntro(projName, hasPool) : defaultIntro(projName, hasPool)),
        rows: reconcileRows(found.opc?.rows, categories, found.opc?.scopes ?? {}),
        scopes: found.opc?.scopes ?? {},
        poolSubtotalExGst: found.opc?.poolSubtotalExGst ?? null,
        exclusions: found.opc?.exclusions ?? DEFAULT_EXCLUSIONS,
        excludedItems: found.opc?.excludedItems ?? [],
        // Fold the legacy single divider into the per-anchor map (it lived before the summary).
        dividers: { ...(found.opc?.dividerImage ? { scope: found.opc.dividerImage } : {}), ...(found.opc?.dividers ?? {}) },
        valueManagement: reconcileOptions(
          found.opc?.valueManagement, optionCategories(found, 'value_management'),
          (category, value) => ({ id: generateId(), title: category, note: '', saving: value, categoryRef: category }),
          (e, value) => ({ ...e, saving: value })),
        upgrades: reconcileOptions(
          found.opc?.upgrades, optionCategories(found, 'upgrade'),
          (category, value) => ({ id: generateId(), title: category, note: '', amount: value, categoryRef: category }),
          (e, value) => ({ ...e, amount: value })),
        docType,
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
  // A patch can be a plain object OR a function of the latest state. Array edits (rows, value
  // management) MUST use the function form and key off item id - deriving the next array from a
  // render-time snapshot lets a slightly-late edit (e.g. a contentEditable blur) overwrite the
  // whole array with stale data, silently dropping a row or resetting a price.
  // Resolve a signed URL for every card photo path not yet resolved (load + after an upload
  // synced from another device). Signed URLs last an hour - plenty for an editing session.
  // Covers all three card lists plus an uploaded (non-/public) divider image.
  const rowImagePaths = [
    ...(opc?.rows ?? []).flatMap(r => (r.images ?? []).map(im => im.path)),
    ...(opc?.upgrades ?? []).flatMap(u => (u.images ?? []).map(im => im.path)),
    ...(opc?.valueManagement ?? []).flatMap(v => (v.images ?? []).map(im => im.path)),
    ...Object.values(opc?.dividers ?? {}).filter(p => !p.startsWith('/')),
  ].join('|')
  useEffect(() => {
    const paths = rowImagePaths ? rowImagePaths.split('|') : []
    for (const p of paths) {
      if (imgUrls[p]) continue
      void attachmentUrl(p).then(url => { if (url) setImgUrls(prev => prev[p] ? prev : { ...prev, [p]: url }) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowImagePaths])

  // Predict where the printed pages break. The cover is page 1 (break-after: page); body content
  // fills 271mm pages (297 - 14mm top - 12mm bottom). Simulated in PRINT flow: an opc-avoid-break
  // block that would straddle a boundary jumps to the next page, pushing everything after it down
  // (tracked as `shift`), exactly like the browser's print engine. Lines are drawn at the SCREEN
  // position each break lands on. Guide mode pins the body to print width, so heights line up.
  useEffect(() => {
    const body = bodyRef.current
    if (!showGuides || !body) { setGuideYs([]); return }
    const compute = () => {
      const pageH = 271 * (96 / 25.4)
      const bodyTop = body.getBoundingClientRect().top
      const blocks = Array.from(body.querySelectorAll<HTMLElement>('.opc-avoid-break'))
        .filter(el => !el.parentElement?.closest('.opc-avoid-break'))   // top-most blocks only
        .map(el => { const r = el.getBoundingClientRect(); return { top: r.top - bodyTop, bottom: r.bottom - bodyTop, h: r.height } })
        .filter(b => b.h < pageH)   // a block taller than a page breaks inside anyway
        .sort((a, b) => a.top - b.top)
      const ys: number[] = []
      let shift = 0            // extra space print inserts ahead of this point (cards that jumped)
      let pageEnd = pageH
      for (const b of blocks) {
        while (b.top + shift >= pageEnd) { ys.push(pageEnd - shift); pageEnd += pageH }
        if (b.bottom + shift > pageEnd) {
          ys.push(b.top)                        // the break lands just before this card
          shift += pageEnd - (b.top + shift)    // print pushes the card to the next page top
          pageEnd += pageH
        }
      }
      while (pageEnd - shift < body.scrollHeight) { ys.push(pageEnd - shift); pageEnd += pageH }
      setGuideYs(prev => prev.length === ys.length && prev.every((v, i) => Math.abs(v - ys[i]) < 0.5) ? prev : ys)
    }
    compute()
    const ro = new ResizeObserver(compute)   // re-measure as photos load / text reflows
    ro.observe(body)
    return () => ro.disconnect()
  }, [showGuides, opc])

  const mutate = (patch: Partial<EstimateOpc> | ((prev: EstimateOpc) => Partial<EstimateOpc>)) => {
    setOpc(prev => {
      const base = (prev ?? {}) as EstimateOpc
      const resolved = typeof patch === 'function' ? patch(base) : patch
      const next = { ...base, ...resolved }
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

  // All row edits read the latest state (prev.rows) rather than the render-time `rows` snapshot,
  // for the same reason as value management above - a late blur must never overwrite the array.
  const setRow = (rowId: string, patch: Partial<OpcRow>) =>
    mutate(prev => ({ rows: (prev.rows ?? []).map(r => r.id === rowId ? { ...r, ...patch } : r) }))

  // ── Card photos (scope rows + upgrade / value-management cards) ── files go to the attachments
  // bucket; the card stores {path, caption?} only. One generic set of handlers keyed by which list
  // the card lives in, so all three card types behave identically.
  type ImgList = 'rows' | 'upgrades' | 'valueManagement'
  const patchImages = (list: ImgList, itemId: string, fn: (ims: OpcRowImage[]) => OpcRowImage[]) =>
    mutate(prev => {
      const arr = (prev[list] ?? []) as { id: string; images?: OpcRowImage[] }[]
      return { [list]: arr.map(it => it.id === itemId ? { ...it, images: fn(it.images ?? []) } : it) } as Partial<EstimateOpc>
    })
  const addCardImage = async (list: ImgList, itemId: string, file: File) => {
    const path = await uploadAttachment(`opc/${id}/${Date.now()}-${safeFileName(file.name)}`, file)
    if (!path) { window.alert('Photo upload failed - check the connection and try again.'); return }
    const url = await attachmentUrl(path)
    if (url) setImgUrls(prev => ({ ...prev, [path]: url }))
    patchImages(list, itemId, ims => [...ims, { path }])
  }
  const removeCardImage = (list: ImgList, itemId: string, path: string) => {
    patchImages(list, itemId, ims => ims.filter(im => im.path !== path))
    void deleteAttachment(path)
  }
  const setCardImageCaption = (list: ImgList, itemId: string, path: string, caption: string) =>
    patchImages(list, itemId, ims => ims.map(im => im.path === path ? { ...im, caption } : im))
  // ── Image bands ── full-width divider images, insertable at any anchor point in the document
  // (after the intro, after any scope card, before/after the summary, after the exclusions).
  const setBand = (anchor: string, image: string | undefined) =>
    mutate(prev => {
      const next = { ...(prev.dividers ?? {}) }
      if (image) next[anchor] = image
      else delete next[anchor]
      return { dividers: next, ...(anchor === 'scope' ? { dividerImage: undefined } : {}) }
    })
  const uploadBand = async (anchor: string, file: File) => {
    const path = await uploadAttachment(`opc/${id}/band-${Date.now()}-${safeFileName(file.name)}`, file)
    if (!path) { window.alert('Photo upload failed - check the connection and try again.'); return }
    const url = await attachmentUrl(path)
    if (url) setImgUrls(prev => ({ ...prev, [path]: url }))
    setBand(anchor, path)
  }
  /** The band itself (with hover controls), or null when the anchor has none. */
  const renderImageBand = (anchor: string) => {
    const image = opc?.dividers?.[anchor]
    if (!image) return null
    return (
      <div className="mb-10 opc-avoid-break relative group/band">
        {image.startsWith('/') || imgUrls[image]
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={image.startsWith('/') ? image : imgUrls[image]} alt=""
              className="w-full h-56 object-cover rounded-lg" style={{ objectPosition: 'center 55%' }} />
          : <div className="w-full h-56 rounded-lg bg-gray-100" />}
        <div className="print:hidden absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover/band:opacity-100 transition-opacity">
          {HERO_IMAGES.map(h => (
            <button key={h} onClick={() => setBand(anchor, h)}
              title={`Image ${h.replace(/\D+/g, '')}`}
              className={`w-2.5 h-2.5 rounded-full border border-white/80 shadow ${image === h ? 'bg-white' : 'bg-white/20 hover:bg-white/60'}`} />
          ))}
          <label className="cursor-pointer ml-1 bg-black/40 text-white rounded-full p-1" title="Upload a project photo">
            <ImagePlus className="w-3 h-3" />
            <input type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void uploadBand(anchor, f); e.target.value = '' }} />
          </label>
          <button onClick={() => setBand(anchor, undefined)} title="Remove the image band"
            className="bg-black/40 text-white rounded-full p-1"><X className="w-3 h-3" /></button>
        </div>
      </div>
    )
  }
  /** Dashed add control shown at a section boundary while the anchor has no band. */
  const renderAddBand = (anchor: string) =>
    opc?.dividers?.[anchor] ? null : (
      <div className="print:hidden mb-10 flex">
        <button onClick={() => setBand(anchor, DEFAULT_DIVIDER)}
          className="flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 border border-dashed border-gray-300 px-2 py-1 transition-colors">
          <ImagePlus className="w-3 h-3" /> add image band
        </button>
      </div>
    )

  // Plain render helpers (NOT components - an inline component type would remount per render and
  // drop caption-input focus on every keystroke).
  const renderCardPhotos = (list: ImgList, itemId: string, images: OpcRowImage[] | undefined) =>
    (images ?? []).length === 0 ? null : (
      <div className="mt-3 flex flex-wrap gap-2">
        {(images ?? []).map(im => (
          <figure key={im.path} className="relative group/img flex-1 min-w-[150px] max-w-[250px]">
            {imgUrls[im.path]
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={imgUrls[im.path]} alt={im.caption || ''} className="w-full h-36 object-cover rounded" />
              : <div className="w-full h-36 rounded bg-white/60" />}
            <button onClick={() => removeCardImage(list, itemId, im.path)} title="Remove photo"
              className="print:hidden absolute top-1 right-1 bg-black/40 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <X className="w-3 h-3" />
            </button>
            <input
              value={im.caption ?? ''}
              onChange={e => setCardImageCaption(list, itemId, im.path, e.target.value)}
              placeholder="caption"
              className="print:hidden mt-1 w-full text-2xs text-gray-500 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-gray-400 outline-none"
            />
            {im.caption && <figcaption className="hidden print:block mt-1 text-2xs" style={{ color: MUTED }}>{im.caption}</figcaption>}
          </figure>
        ))}
      </div>
    )
  const renderPhotoButton = (list: ImgList, itemId: string) => (
    <label className="cursor-pointer flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 border border-gray-200 px-1.5 py-0.5 transition-colors" title="Add photos to this card">
      <ImagePlus className="w-3 h-3" /> photo
      <input type="file" accept="image/*" multiple className="hidden"
        onChange={e => { Array.from(e.target.files ?? []).forEach(f => void addCardImage(list, itemId, f)); e.target.value = '' }} />
    </label>
  )

  /** Merge a row into a target: categories combine, scope text concatenates, source row goes. */
  const mergeInto = (sourceId: string, targetId: string) => {
    mutate(prev => {
      const rs = prev.rows ?? []
      const source = rs.find(r => r.id === sourceId)
      const target = rs.find(r => r.id === targetId)
      if (!source || !target) return {}
      return {
        rows: rs
          .filter(r => r.id !== sourceId)
          .map(r => r.id === targetId
            ? { ...r, categories: [...r.categories, ...source.categories], scope: joinProse(r.scope, source.scope) }
            : r),
      }
    })
  }

  /** Eject a category out of a merged row back to its own line. */
  const ejectCategory = (rowId: string, category: string) => {
    mutate(prev => {
      const rs = prev.rows ?? []
      const row = rs.find(r => r.id === rowId)
      if (!row || row.categories.length < 2) return {}
      const next = rs.map(r => r.id === rowId ? { ...r, categories: r.categories.filter(c => c !== category) } : r)
      next.push({ id: generateId(), title: category, categories: [category], scope: '' })
      return { rows: next }
    })
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
      valueManagement: (opc.valueManagement ?? []).map(v => ({ ...v, title: swap(v.title), note: swap(v.note ?? '') })),
      upgrades: (opc.upgrades ?? []).map(u => ({ ...u, title: swap(u.title), note: swap(u.note ?? '') })),
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

  // Print, but warn first if any priced category has no scope written - a half-finished OPC
  // shouldn't reach a client by accident.
  const printOpc = () => {
    const blank = rows.filter(r => priceOf(r) > 0 && !stripProse(r.scope).trim()).map(r => r.title)
    if (blank.length > 0) {
      const list = blank.slice(0, 4).join(', ') + (blank.length > 4 ? `, +${blank.length - 4} more` : '')
      if (!window.confirm(`${blank.length} priced categor${blank.length === 1 ? 'y has' : 'ies have'} no scope written (${list}). Print anyway?`)) return
    }
    window.print()
  }

  // The document must add up for the client: the landscape subtotal is the SUM OF THE ROUNDED ROWS.
  const landscapeExGst = rows.reduce((s, r) => s + priceOf(r), 0)
  const poolExGst = opc.poolSubtotalExGst ?? 0
  const hasPoolFigure = poolExGst > 0
  // Pool bands (and the landscape/pool/combined breakdown) only exist on pool projects, or when
  // an older OPC already carries a pool figure. Landscape-only jobs get one total band.
  const poolRelevant = estimate.projectType === 'landscape_and_pool' || estimate.projectType === 'pool_only' || hasPoolFigure
  const combinedExGst = landscapeExGst + poolExGst

  // Cost breakdown (table + chart): every priced category, plus Pool & Spa when present, largest
  // first. Bars scale to the biggest line; the % column is share of the whole project.
  const breakdown = [
    ...rows.map(r => ({ title: r.title, price: priceOf(r) })),
    ...(hasPoolFigure ? [{ title: 'Pool & Spa', price: poolExGst }] : []),
  ].filter(b => b.price > 0).sort((a, b) => b.price - a.price)
  const breakdownTotal = breakdown.reduce((s, b) => s + b.price, 0)
  const breakdownMax = Math.max(...breakdown.map(b => b.price), 1)
  const money = (n: number) => formatCurrency(n)

  const docDate = opc.date ? new Date(opc.date) : new Date()
  const dateLabel = docDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  const exclusions = opc.exclusions ?? []
  const excludedItems = opc.excludedItems ?? []
  const valueManagement = opc.valueManagement ?? []
  const vmTotal = valueManagement.reduce((s, v) => s + (Number(v.saving) || 0), 0)
  const upgrades = opc.upgrades ?? []
  const upTotal = upgrades.reduce((s, u) => s + (Number(u.amount) || 0), 0)
  // Both closing sections are optional and only print when they hold something, so the section
  // number for upgrades shifts up when value management is empty (no gap in the printed doc).
  const upgradesPrintNum = valueManagement.length > 0 ? '05' : '04'

  // Quote mode: the SAME document, framed as a formal quote (title, disclaimer, quote number,
  // valid-until, acceptance block) with none of the OPC content lost.
  const isQuote = (opc.docType ?? 'opc') === 'quote'
  const hasPoolType = estimate.projectType === 'landscape_and_pool' || estimate.projectType === 'pool_only'
  const projName = estimate.name || estimate.projectName || 'client'
  const validUntil = new Date(docDate.getTime() + 30 * 86400000)
  const validUntilLabel = validUntil.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
  // Document number: editable on the cover, defaulting to the estimate version zero-padded - so
  // v3's OPC reads "03" and a re-issue can be bumped by hand without minting a new version.
  const docNumber = (opc.docNumber ?? '').trim() || String(estimate.version).padStart(2, '0')
  const quoteNumber = `FG-${estimate.projectId
    ? `${estimate.projectId.slice(-4).toUpperCase()}-${docNumber}`
    : `${estimate.id.slice(-6).toUpperCase()}-${docNumber}`}`
  // Flip OPC <-> Quote. Swap the intro too, but only if it's still the source mode's auto default
  // (so a hand-written intro is never overwritten).
  const setDocType = (next: 'opc' | 'quote') => {
    const oldDefault = next === 'quote' ? defaultIntro(projName, hasPoolType) : defaultQuoteIntro(projName, hasPoolType)
    const newDefault = next === 'quote' ? defaultQuoteIntro(projName, hasPoolType) : defaultIntro(projName, hasPoolType)
    const cur = stripProse(opc.intro ?? '').trim()
    mutate({ docType: next, ...((!cur || cur === oldDefault.trim()) ? { intro: newDefault } : {}) })
  }

  return (
    <div className="min-h-screen bg-white" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <style>{`
        .opc-prose { min-height: 1.5em; }
        .opc-prose:empty::before { content: attr(data-placeholder); color: #9ca3af; }
        .opc-prose ul { list-style: disc; padding-left: 1.4em; margin: 0.25em 0; }
        .opc-prose ol { list-style: decimal; padding-left: 1.4em; margin: 0.25em 0; }
        /* The cover keeps a zero margin (full-bleed hero, and no room for the browser's own
           header/footer text on page 1). Every OTHER page gets real margins - previously they
           were zero too, and because .opc-body's padding only exists at the start and end of the
           whole flow, page 2+ content started at the literal paper edge. Trade-off: with margins
           present the browser CAN draw its URL/date header on later pages again if the print
           dialog's "Headers and footers" option is ticked - untick it once and it stays off. */
        @page { margin: 14mm 12mm 12mm; }
        @page :first { margin: 0; }
        @media print {
          .opc-cover { height: 29.6cm; break-after: page; }
          .opc-avoid-break { break-inside: avoid; }
          .opc-prose:empty::before { content: ''; }
          /* Horizontal gutter = 12mm page margin + 4mm padding, matching the old 16mm feel. */
          .opc-body { padding: 0.2cm 0.4cm; }
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
          {/* One-click OPC <-> Quote: same document, quote framing, nothing lost. */}
          <button
            onClick={() => setDocType(isQuote ? 'opc' : 'quote')}
            title={isQuote ? 'Turn this back into an Opinion of Probable Cost' : 'Turn this OPC into a formal Quote - keeps all the content'}
            className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-light tracking-architectural uppercase hover:bg-emerald-700 transition-colors"
          >
            {isQuote ? 'Turn into OPC' : 'Turn into Quote'}
          </button>
          <SpellCheckButton
            getTexts={() => [
              { label: 'Intro', text: stripProse(opc.intro ?? '') },
              ...rows.flatMap(r => [
                { label: 'Category title', text: r.title },
                { label: `Scope: ${r.title || 'category'}`, text: stripProse(r.scope) },
              ]),
              ...(opc.exclusions ?? []).flatMap(ex => [
                { label: 'Exclusion title', text: ex.title },
                { label: `Exclusion: ${ex.title || ''}`.trim().replace(/:$/, ''), text: stripProse(ex.blurb) },
              ]),
              ...(opc.excludedItems ?? []).map(it => ({ label: 'Excluded item', text: it })),
              ...(opc.valueManagement ?? []).flatMap(v => [
                { label: 'Value option title', text: v.title },
                { label: `Value option: ${v.title || ''}`.trim().replace(/:$/, ''), text: stripProse(v.note ?? '') },
              ]),
              ...(opc.upgrades ?? []).flatMap(u => [
                { label: 'Upgrade title', text: u.title },
                { label: `Upgrade: ${u.title || ''}`.trim().replace(/:$/, ''), text: stripProse(u.note ?? '') },
              ]),
            ]}
            onReplace={replaceWord}
          />
          <button
            onClick={() => setShowGuides(g => !g)}
            title="Show where the printed A4 pages break - the body narrows to the exact print width so photo fit is what you will get on paper"
            className={`px-3 py-1.5 text-xs font-light tracking-architectural uppercase transition-colors ${showGuides ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
          >
            A4 guides
          </button>
          <button
            onClick={printOpc}
            className="flex items-center gap-2 px-4 py-1.5 bg-white/10 text-white/80 text-xs font-light tracking-architectural uppercase hover:bg-white/20 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* ── COVER ── */}
      <div className="opc-cover relative h-[70vh] min-h-[480px] group/hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={opc.heroImage || HERO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 55%' }} />
        {/* Cover image picker - cycles the shared proposal hero set; shows on hover, never prints */}
        <div className="print:hidden absolute top-8 right-10 flex items-center gap-1 opacity-0 group-hover/hero:opacity-100 transition-opacity">
          {HERO_IMAGES.map(h => (
            <button key={h} onClick={() => mutate({ heroImage: h })}
              title={`Cover image ${h.replace(/\D+/g, '')}`}
              className={`w-2.5 h-2.5 rounded-full border border-white/70 ${(opc.heroImage || HERO_IMAGE) === h ? 'bg-white' : 'bg-white/20 hover:bg-white/50'}`} />
          ))}
        </div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.1) 100%)' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/formation-logo-white.svg" alt="Formation" className="absolute top-8 left-10 h-6 w-auto" />
        <div className="absolute bottom-12 left-10 right-10">
          <p className="text-white/60 text-xs tracking-[0.25em] uppercase mb-3">{isQuote ? 'Quotation' : 'Preliminary Pricing'}</p>
          {!isQuote && (
            <h1 className="text-white font-light leading-tight mb-4" style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', letterSpacing: '0.01em' }}>
              Opinion of Probable Cost<span className="text-white/50"> &mdash; {docNumber}</span>
            </h1>
          )}
          <p className={`text-white/90 font-light text-xl mb-1 ${isQuote ? 'mt-1' : ''}`}>{clientName}</p>
          {clientAddress && <p className="text-white/70 font-light text-base">{clientAddress}</p>}
          <div className="print:hidden mt-3 flex items-center gap-2">
            <input
              type="date"
              value={opc.date ?? ''}
              onChange={e => mutate({ date: e.target.value })}
              className="bg-transparent text-white/60 text-sm font-light border border-white/20 px-2 py-0.5 rounded-none outline-none [color-scheme:dark]"
            />
            <input
              value={opc.docNumber ?? ''}
              onChange={e => mutate({ docNumber: e.target.value })}
              placeholder={String(estimate.version).padStart(2, '0')}
              title="Document number - blank uses the estimate version"
              className="w-16 bg-transparent text-white/60 text-sm font-light border border-white/20 px-2 py-0.5 rounded-none outline-none placeholder:text-white/30"
            />
            <span className="text-white/40 text-xs font-light">doc no.</span>
          </div>
          <p className="hidden print:block text-white/60 text-sm font-light mt-3">{dateLabel}</p>
          {isQuote && (
            <p className="text-white/60 text-sm font-light mt-1">Quote no. {quoteNumber} &middot; Valid until {validUntilLabel}</p>
          )}
        </div>
      </div>

      <div
        ref={bodyRef}
        className="opc-body relative max-w-[860px] mx-auto px-8 py-14"
        style={showGuides ? { maxWidth: '186mm', padding: '0.2cm 0.4cm' } : undefined}
      >
        {/* A4 page-break guides (screen only). Page 1 is the cover; the body starts on page 2. */}
        {showGuides && (
          <div className="print:hidden absolute inset-0 pointer-events-none" aria-hidden>
            <span className="absolute right-0 top-0 text-[9px] font-light text-red-400/80 bg-white/80 px-1">page 2</span>
            {guideYs.map((y, i) => (
              <div key={i} className="absolute left-0 right-0" style={{ top: y }}>
                <div className="border-t border-dashed border-red-400/60" />
                <span className="absolute right-0 top-0.5 text-[9px] font-light text-red-400/80 bg-white/80 px-1">page {i + 3}</span>
              </div>
            ))}
          </div>
        )}
        {/* Intro */}
        <div className="mb-10">
          <ProseField
            value={opc.intro ?? ''}
            onChange={v => mutate({ intro: v })}
            placeholder="Intro paragraph…"
            className="text-sm font-light leading-relaxed"
          />
        </div>
        {renderImageBand('intro')}
        {renderAddBand('intro')}

        {/* ── LANDSCAPE CONSTRUCTION ESTIMATE ── */}
        <div className="mb-10">
          <p className="text-2xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>01 — Landscape Construction Estimate</p>
          <div className="h-px w-16 mb-6" style={{ backgroundColor: GREEN }} />

          <div className="space-y-2">
            {rows.map(row => {
              const price = priceOf(row)
              const others = rows.filter(r => r.id !== row.id)
              return (
                <React.Fragment key={row.id}>
                <div className="opc-avoid-break rounded-lg px-5 py-3.5" style={{ backgroundColor: BG_WARM, borderLeft: `3px solid ${GREEN}` }}>
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <input
                        value={row.title}
                        onChange={e => setRow(row.id, { title: e.target.value })}
                        className="print:hidden w-full text-sm font-medium bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-none outline-none"
                        style={{ color: HEADING }}
                      />
                      <p className="hidden print:block text-sm font-medium" style={{ color: HEADING }}>{row.title}</p>
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
                    <p className="text-base font-normal tabular-nums whitespace-nowrap shrink-0" style={{ color: price > 0 ? GREEN : MUTED }}>
                      {price > 0 ? money(price) : ''}
                    </p>
                  </div>
                  <div className="mt-1.5">
                    <ProseField
                      value={row.scope}
                      onChange={v => setRow(row.id, { scope: v })}
                      placeholder="Client-facing scope of works…"
                      className="text-xs font-light leading-relaxed"
                    />
                  </div>
                  {/* Card photos - flow with the card (no fixed frames, so any scope length works).
                      They wrap into a row of up to ~3; the whole card still avoids page breaks. */}
                  {renderCardPhotos('rows', row.id, row.images)}
                  <div className="print:hidden mt-2.5 flex items-center gap-2">
                    {renderPhotoButton('rows', row.id)}
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
                    {!opc.dividers?.[`row:${row.id}`] && (
                      <button onClick={() => setBand(`row:${row.id}`, DEFAULT_DIVIDER)}
                        title="Add a full-width image band below this card"
                        className="flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 border border-dashed border-gray-200 px-1.5 py-0.5 transition-colors">
                        <ImagePlus className="w-3 h-3" /> band
                      </button>
                    )}
                  </div>
                </div>
                {renderImageBand(`row:${row.id}`)}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* ── IMAGE BAND: between scope and summary ── */}
        {renderImageBand('scope')}
        {renderAddBand('scope')}

        {/* ── PROJECT COST SUMMARY ── */}
        <div className="mb-10 opc-avoid-break">
          <p className="text-2xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>02 — Project Cost Summary</p>
          <div className="h-px w-16 mb-6" style={{ backgroundColor: GREEN }} />

          {/* Breakdown: table + chart in one - category, spend bar (scaled to the biggest line),
              amount and % of total, largest first so the story reads at a glance. */}
          {breakdown.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-3 pb-2 mb-1 border-b border-gray-200">
                <span className="w-44 shrink-0 text-2xs font-normal tracking-widest uppercase" style={{ color: MUTED }}>Category</span>
                <span className="flex-1 text-2xs font-normal tracking-widest uppercase" style={{ color: MUTED }}>Share of project</span>
                <span className="w-24 text-right text-2xs font-normal tracking-widest uppercase" style={{ color: MUTED }}>Amount</span>
                <span className="w-12 text-right text-2xs font-normal tracking-widest uppercase" style={{ color: MUTED }}>%</span>
              </div>
              {breakdown.map(b => {
                const pctOfTotal = breakdownTotal > 0 ? (b.price / breakdownTotal) * 100 : 0
                return (
                  <div key={b.title} className="flex items-center gap-3 py-1.5 border-b border-gray-100 break-inside-avoid">
                    <span className="w-44 shrink-0 text-xs font-light truncate" style={{ color: HEADING }} title={b.title}>{b.title}</span>
                    <div className="flex-1 h-3 rounded-sm" style={{ backgroundColor: '#EDEBE8' }}>
                      <div className="h-full rounded-sm" style={{ width: `${(b.price / breakdownMax) * 100}%`, backgroundColor: GREEN }} />
                    </div>
                    <span className="w-24 text-right text-xs font-light tabular-nums" style={{ color: BODY }}>{money(b.price)}</span>
                    <span className="w-12 text-right text-xs font-light tabular-nums" style={{ color: MUTED }}>{Math.round(pctOfTotal)}%</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="space-y-2">
            {/* Landscape-only jobs get ONE total band - the per-section + combined breakdown only
                earns its place when a pool figure joins the landscape number. */}
            {poolRelevant && (
            <div className="flex items-center justify-between px-6 py-3" style={{ backgroundColor: BG_WARM }}>
              <p className="text-sm font-light" style={{ color: HEADING }}>Landscape Construction</p>
              <p className="text-xs font-light tabular-nums" style={{ color: BODY }}>
                Subtotal ex. GST: <span className="font-normal">{money(landscapeExGst)}</span>
                <span className="mx-2 text-gray-300">|</span>GST: {money(landscapeExGst * 0.1)}
                <span className="mx-2 text-gray-300">|</span>Total: <span className="font-normal">{money(landscapeExGst * 1.1)}</span>
              </p>
            </div>
            )}
            {poolRelevant && (
            <div className="flex items-center justify-between px-6 py-3" style={{ backgroundColor: BG_WARM }}>
              <div className="flex items-center gap-3">
                <p className="text-sm font-light" style={{ color: HEADING }}>Pool &amp; Spa</p>
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
              <p className="text-xs font-light tabular-nums" style={{ color: BODY }}>
                {hasPoolFigure
                  ? <>Subtotal ex. GST: <span className="font-normal">{money(poolExGst)}</span>
                      <span className="mx-2 text-gray-300">|</span>GST: {money(poolExGst * 0.1)}
                      <span className="mx-2 text-gray-300">|</span>Total: <span className="font-normal">{money(poolExGst * 1.1)}</span></>
                  : <span className="print:hidden text-gray-400">enter the Lume figure to include</span>}
              </p>
            </div>
            )}
            <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: GREEN }}>
              <p className="text-sm font-normal text-white">{hasPoolFigure ? 'Combined Project Total' : 'Project Total'}</p>
              <p className="text-xs font-light text-white/90 tabular-nums">
                Ex. GST: <span className="font-normal text-white">{money(combinedExGst)}</span>
                <span className="mx-2 text-white/30">|</span>GST: {money(combinedExGst * 0.1)}
                <span className="mx-2 text-white/30">|</span>Total inc. GST: <span className="font-semibold text-white">{money(combinedExGst * 1.1)}</span>
              </p>
            </div>
          </div>

          <p className="text-xs font-light italic mt-4" style={{ color: MUTED }}>
            A formal fixed-price quote will follow once the design and scope are finalised.
          </p>
        </div>

        {/* ── IMAGE BAND: after the summary ── */}
        {renderImageBand('summary')}
        {renderAddBand('summary')}

        {/* ── EXCLUSIONS & KEY NOTES ── */}
        <div className="mb-10 opc-avoid-break">
          <p className="text-2xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>03 — Exclusions &amp; Key Notes</p>
          <div className="h-px w-16 mb-6" style={{ backgroundColor: GREEN }} />

          <p className="text-2xs font-normal tracking-widest uppercase mb-3" style={{ color: MUTED }}>
            {hasPoolFigure ? 'Excluded from Both Quotes' : 'Excluded'}
          </p>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {exclusions.map((ex, i) => (
              <div key={i} className="relative group px-4 py-3" style={{ backgroundColor: BG_WARM }}>
                <button
                  onClick={() => mutate({ exclusions: exclusions.filter((_, j) => j !== i) })}
                  title="Remove" className="print:hidden absolute top-2 right-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
                <input
                  value={ex.title}
                  onChange={e => mutate({ exclusions: exclusions.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })}
                  className="print:hidden w-full text-xs font-medium bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-none outline-none mb-1"
                  style={{ color: HEADING }}
                />
                <p className="hidden print:block text-xs font-medium mb-1" style={{ color: HEADING }}>{ex.title}</p>
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
            className="print:hidden flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 transition-colors">
            <Plus className="w-3 h-3" /> Add exclusion
          </button>
        </div>

        {/* ── IMAGE BAND: after the exclusions ── */}
        {renderImageBand('exclusions')}
        {renderAddBand('exclusions')}

        {/* ── VALUE MANAGEMENT ── options to reduce cost, with a total possible saving. Hidden in
            print when there are none so an empty section never prints. */}
        <div className={`mb-10 opc-avoid-break ${valueManagement.length === 0 ? 'print:hidden' : ''}`}>
          <p className="text-2xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>04 — Value Management</p>
          <div className="h-px w-16 mb-4" style={{ backgroundColor: GREEN }} />
          <p className="text-xs font-light leading-relaxed mb-5 max-w-2xl" style={{ color: BODY }}>
            Options to reduce the overall cost without compromising the outcome. Each can be taken up
            independently; the potential saving for each is shown below.
          </p>
          {valueManagement.length === 0 && (
            <p className="print:hidden text-2xs italic mb-4" style={{ color: MUTED }}>
              Optional - this section is left out of the printed document while it is empty.
            </p>
          )}

          <div className="space-y-2 mb-4">
            {valueManagement.map(v => (
              <div key={v.id} className="relative group flex items-start gap-4 px-4 py-3" style={{ backgroundColor: BG_WARM }}>
                {v.categoryRef ? (
                  <span title="Priced from the estimate - unflag the category there to remove"
                    className="print:hidden absolute top-2 right-2 text-2xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    from estimate
                  </span>
                ) : (
                  <button
                    onClick={() => mutate(prev => ({ valueManagement: (prev.valueManagement ?? []).filter(x => x.id !== v.id) }))}
                    title="Remove" className="print:hidden absolute top-2 right-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                )}
                <div className="flex-1 min-w-0 pr-6">
                  <input
                    value={v.title}
                    onChange={e => mutate(prev => ({ valueManagement: (prev.valueManagement ?? []).map(x => x.id === v.id ? { ...x, title: e.target.value } : x) }))}
                    placeholder="Value management option"
                    className="print:hidden w-full text-sm font-medium bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-none outline-none mb-1"
                    style={{ color: HEADING }}
                  />
                  <p className="hidden print:block text-sm font-medium mb-1" style={{ color: HEADING }}>{v.title}</p>
                  <ProseField
                    value={v.note ?? ''}
                    onChange={val => mutate(prev => ({ valueManagement: (prev.valueManagement ?? []).map(x => x.id === v.id ? { ...x, note: val } : x) }))}
                    placeholder="What changes and why it saves…"
                    className="text-xs font-light leading-relaxed"
                  />
                  {renderCardPhotos('valueManagement', v.id, v.images)}
                  <div className="print:hidden mt-2 flex">{renderPhotoButton('valueManagement', v.id)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xs tracking-widest uppercase mb-0.5" style={{ color: MUTED }}>Saving</p>
                  <div className="flex items-baseline justify-end gap-0.5">
                    <span className="text-sm font-normal" style={{ color: GREEN }}>-$</span>
                    {v.categoryRef ? (
                      <span title="Priced from the estimate category" className="print:hidden inline-block w-20 text-right text-sm font-normal tabular-nums" style={{ color: GREEN }}>
                        {(v.saving || 0).toLocaleString('en-AU')}
                      </span>
                    ) : (
                    <input
                      type="number" inputMode="decimal" value={v.saving || ''}
                      onChange={e => { const n = Math.max(0, Number(e.target.value) || 0); mutate(prev => ({ valueManagement: (prev.valueManagement ?? []).map(x => x.id === v.id ? { ...x, saving: n } : x) })) }}
                      placeholder="0"
                      className="print:hidden w-20 text-right text-sm font-normal bg-transparent border-b border-gray-300 focus:border-gray-500 outline-none tabular-nums"
                      style={{ color: GREEN }}
                    />
                    )}
                    <span className="hidden print:inline text-sm font-normal tabular-nums" style={{ color: GREEN }}>{(v.saving || 0).toLocaleString('en-AU')}</span>
                  </div>
                  <p className="text-2xs font-light mt-0.5" style={{ color: MUTED }}>ex GST</p>
                </div>
              </div>
            ))}
          </div>

          {valueManagement.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 mb-3" style={{ backgroundColor: GREEN }}>
              <p className="text-sm font-normal text-white">Total potential saving</p>
              <p className="text-lg font-semibold text-white tabular-nums">-{money(vmTotal)} <span className="text-xs font-light text-white/60">ex GST</span></p>
            </div>
          )}

          <button
            onClick={() => mutate(prev => ({ valueManagement: [...(prev.valueManagement ?? []), { id: generateId(), title: 'New value management option', note: '', saving: 0 }] }))}
            className="print:hidden flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 transition-colors">
            <Plus className="w-3 h-3" /> Add value management option
          </button>
        </div>

        {/* ── UPGRADES ── the mirror of value management: optional extras the client can add, with
            the cost each adds. Optional too, so it only prints when it holds something, and it
            takes 04 when value management is empty. */}
        <div className={`mb-10 opc-avoid-break ${upgrades.length === 0 ? 'print:hidden' : ''}`}>
          <p className="text-2xs tracking-[0.25em] uppercase mb-2" style={{ color: GREEN }}>
            <span className="print:hidden">05</span>
            <span className="hidden print:inline">{upgradesPrintNum}</span>
            {' '}&mdash; Upgrade Options
          </p>
          <div className="h-px w-16 mb-4" style={{ backgroundColor: GREEN }} />
          <p className="text-xs font-light leading-relaxed mb-5 max-w-2xl" style={{ color: BODY }}>
            Optional additions to the scope described above. Each can be taken up independently; the
            additional cost for each is shown below.
          </p>
          {upgrades.length === 0 && (
            <p className="print:hidden text-2xs italic mb-4" style={{ color: MUTED }}>
              Optional - this section is left out of the printed document while it is empty.
            </p>
          )}

          <div className="space-y-2 mb-4">
            {upgrades.map(u => (
              <div key={u.id} className="relative group flex items-start gap-4 px-4 py-3" style={{ backgroundColor: BG_WARM }}>
                {u.categoryRef ? (
                  <span title="Priced from the estimate - unflag the category there to remove"
                    className="print:hidden absolute top-2 right-2 text-2xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    from estimate
                  </span>
                ) : (
                  <button
                    onClick={() => mutate(prev => ({ upgrades: (prev.upgrades ?? []).filter(x => x.id !== u.id) }))}
                    title="Remove" className="print:hidden absolute top-2 right-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3 h-3" />
                  </button>
                )}
                <div className="flex-1 min-w-0 pr-6">
                  <input
                    value={u.title}
                    onChange={e => mutate(prev => ({ upgrades: (prev.upgrades ?? []).map(x => x.id === u.id ? { ...x, title: e.target.value } : x) }))}
                    placeholder="Upgrade option"
                    className="print:hidden w-full text-sm font-medium bg-transparent border border-transparent hover:border-gray-300 focus:border-gray-400 rounded-none outline-none mb-1"
                    style={{ color: HEADING }}
                  />
                  <p className="hidden print:block text-sm font-medium mb-1" style={{ color: HEADING }}>{u.title}</p>
                  <ProseField
                    value={u.note ?? ''}
                    onChange={val => mutate(prev => ({ upgrades: (prev.upgrades ?? []).map(x => x.id === u.id ? { ...x, note: val } : x) }))}
                    placeholder="What the upgrade adds…"
                    className="text-xs font-light leading-relaxed"
                  />
                  {renderCardPhotos('upgrades', u.id, u.images)}
                  <div className="print:hidden mt-2 flex">{renderPhotoButton('upgrades', u.id)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-2xs tracking-widest uppercase mb-0.5" style={{ color: MUTED }}>Add</p>
                  <div className="flex items-baseline justify-end gap-0.5">
                    <span className="text-sm font-normal" style={{ color: HEADING }}>+$</span>
                    {u.categoryRef ? (
                      <span title="Priced from the estimate category" className="print:hidden inline-block w-20 text-right text-sm font-normal tabular-nums" style={{ color: HEADING }}>
                        {(u.amount || 0).toLocaleString('en-AU')}
                      </span>
                    ) : (
                    <input
                      type="number" inputMode="decimal" value={u.amount || ''}
                      onChange={e => { const n = Math.max(0, Number(e.target.value) || 0); mutate(prev => ({ upgrades: (prev.upgrades ?? []).map(x => x.id === u.id ? { ...x, amount: n } : x) })) }}
                      placeholder="0"
                      className="print:hidden w-20 text-right text-sm font-normal bg-transparent border-b border-gray-300 focus:border-gray-500 outline-none tabular-nums"
                      style={{ color: HEADING }}
                    />
                    )}
                    <span className="hidden print:inline text-sm font-normal tabular-nums" style={{ color: HEADING }}>{(u.amount || 0).toLocaleString('en-AU')}</span>
                  </div>
                  <p className="text-2xs font-light mt-0.5" style={{ color: MUTED }}>ex GST</p>
                </div>
              </div>
            ))}
          </div>

          {upgrades.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 mb-3" style={{ backgroundColor: HEADING }}>
              <p className="text-sm font-normal text-white">Total if all upgrades taken</p>
              <p className="text-lg font-semibold text-white tabular-nums">+{money(upTotal)} <span className="text-xs font-light text-white/60">ex GST</span></p>
            </div>
          )}

          <button
            onClick={() => mutate(prev => ({ upgrades: [...(prev.upgrades ?? []), { id: generateId(), title: 'New upgrade option', note: '', amount: 0 }] }))}
            className="print:hidden flex items-center gap-1 text-2xs text-gray-400 hover:text-gray-700 transition-colors">
            <Plus className="w-3 h-3" /> Add upgrade option
          </button>
        </div>

        {/* Closing block: disclaimer + get-in-touch + contact details */}
        <div className="border-t border-gray-200 pt-6 pb-2 opc-avoid-break">
          <p className="text-xs font-light italic mb-6" style={{ color: MUTED }}>
            {isQuote
              ? `This quote is fixed for the scope described and valid for 30 days from the date above. Prices are subject to change after this period or if the scope changes.`
              : `This Opinion of Probable Cost is preliminary pricing prepared from the design documentation available at the date above. It is not a fixed-price quotation; a formal quote will follow once the design and scope are finalised.`}
          </p>
          <div className="flex items-end justify-between gap-6">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/formation-primary-black.svg" alt="Formation Landscapes" className="h-8 w-auto mb-2"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
              <p className="text-2xs font-light" style={{ color: MUTED }}>Formation Landscapes Pty Ltd · Melbourne, Victoria</p>
              <p className="text-2xs font-light" style={{ color: MUTED }}>
                ABN {CONTACT.abnFormation}{poolRelevant ? ` · Lume Pools ABN ${CONTACT.abnLume}` : ''}
              </p>
            </div>
            <div className="text-right text-xs font-light leading-relaxed" style={{ color: BODY }}>
              <p className="text-2xs tracking-widest uppercase mb-1.5" style={{ color: MUTED }}>To proceed or discuss</p>
              {CONTACT.phone && <p>{CONTACT.phone}</p>}
              {CONTACT.email && <p>{CONTACT.email}</p>}
              {CONTACT.web && <p style={{ color: GREEN }}>{CONTACT.web}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
