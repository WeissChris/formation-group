import { formatCurrency } from '@/lib/utils'

interface Props {
  clientName: string
  projectAddress: string
  introText?: string
  phase1Scope: string
  phase1Fee: number
  phase2Scope: string
  phase2Fee: number
  phase3Scope?: string
  phase3Fee?: number
  validUntil: string
  welcomeVideoUrl?: string
  processVideoUrl?: string
}

// ── Video helpers ────────────────────────────────────────────────────────────
function toEmbedUrl(url: string): string | null {
  if (!url) return null
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  if (url.includes('/embed/') || url.includes('player.vimeo.com')) return url
  return null
}

function ProposalVideo({ url, heading, caption }: { url?: string; heading: string; caption?: string }) {
  const embed = url ? toEmbedUrl(url) : null
  if (!embed) return null
  return (
    <div className="border-t p-8" style={{ borderColor: '#e5e7eb' }}>
      <h3 className="font-light mb-4" style={{ fontSize: 20, color: '#1a1a1a' }}>
        {heading}
      </h3>
      <div className="aspect-video w-full bg-black overflow-hidden rounded-sm">
        <iframe
          src={embed}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={heading}
        />
      </div>
      {caption && (
        <p className="text-xs font-light leading-relaxed mt-3" style={{ color: '#6b6b6b' }}>
          {caption}
        </p>
      )}
    </div>
  )
}

// ── Brand colours ────────────────────────────────────────────────────────────
const GREEN = '#3D5A3A'
const HEADING = '#1a1a1a'
const BODY = '#2d2d2d'
const MUTED = '#6b6b6b'
const LIGHT_MUTED = '#8A8580'
const BORDER = '#e5e7eb'
const BG_WARM = '#F0EEEB'

// ── Default videos (Formation-branded, shown on every proposal unless overridden) ──
const DEFAULT_WELCOME_VIDEO_URL = 'https://vimeo.com/892469176'
const DEFAULT_PROCESS_VIDEO_URL = 'https://vimeo.com/867802765'

// ── Images ───────────────────────────────────────────────────────────────────
const HERO_IMAGE = '/proposal-hero-8.jpg'
const INTRO_IMAGE = '/proposal-hero-7.jpg'
const ABOUT_IMAGE = '/proposal-hero-6.jpg'
const PROCESS_IMAGE = '/proposal-hero-9.jpg'

function scopeToPoints(scope: string): string[] {
  if (!scope) return []
  const byNewline = scope.split('\n').map(s => s.trim()).filter(Boolean)
  if (byNewline.length > 1) return byNewline
  return scope.split('. ').map(s => s.trim()).filter(Boolean)
}

// ── Chevron Badge ────────────────────────────────────────────────────────────
function ChevronBadge({ number }: { number: number }) {
  return (
    <div className="relative w-full" style={{ height: 40 }}>
      <svg viewBox="0 0 600 56" className="w-full h-full" preserveAspectRatio="none">
        <polygon points="0,0 570,0 600,28 570,56 0,56 30,28" fill="#DADDE5" />
        <text x="300" y="32" textAnchor="middle" dominantBaseline="middle" fill="#4a4a4a" fontSize="20" fontFamily="system-ui, -apple-system, sans-serif">
          {number}
        </text>
      </svg>
    </div>
  )
}

// ── Deliverables Box ─────────────────────────────────────────────────────────
function DeliverablesBox({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg p-5" style={{ backgroundColor: GREEN }}>
      <h4 className="text-white text-sm font-light mb-3">Deliverables</h4>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-white/60 mt-1 text-[5px]">●</span>
            <span className="text-white/90 text-xs font-light leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ProposalPreview({
  clientName, projectAddress, introText,
  phase1Scope, phase1Fee,
  phase2Scope, phase2Fee,
  phase3Scope, phase3Fee,
  validUntil,
  welcomeVideoUrl,
  processVideoUrl,
}: Props) {
  const total = phase1Fee + phase2Fee + (phase3Fee ?? 0)

  const phases = [
    { num: 1, label: 'Phase 1', title: 'Concept / Schematic Design', scope: phase1Scope, fee: phase1Fee },
    { num: 2, label: 'Phase 2', title: 'Design Development', scope: phase2Scope, fee: phase2Fee },
    ...(phase3Scope && phase3Fee
      ? [{ num: 3, label: 'Phase 3', title: 'Administration', scope: phase3Scope, fee: phase3Fee }]
      : []),
  ]

  const defaultIntro = `Thank you for the opportunity to meet on site and discuss your project.\n\nFrom our initial consultation, it's clear there is a strong opportunity to reshape the landscape into a highly resolved, functional, and visually cohesive environment.\n\nThe following outlines our proposed design process and associated fees.`
  const displayIntro = introText || defaultIntro

  const firstName = clientName.split(' ').filter(Boolean)
  const greeting = firstName.length >= 3
    ? `Hi ${firstName[0]} and ${firstName[firstName.length - 1]},`
    : firstName.length === 2
      ? `Hi ${firstName[0]},`
      : `Hi ${clientName || 'there'},`

  const phaseDescriptions = [
    'This stage focuses on establishing the overall vision and spatial layout of the project. We explore how the landscape will function, how key elements are positioned, and how the space will feel.',
    'During this stage, the concept is refined and resolved into a fully considered design. We work through how each element comes together, finalising layouts, levels, materials, and key selections.',
    'This stage translates the resolved design into detailed construction drawings and specifications. These documents provide clear instruction for construction, ensuring all elements are built accurately and consistently.',
  ]

  const outcomes = [
    'A clear and cohesive design direction that defines the layout, functionality, and overall aesthetic of the project.',
    'A resolved and coordinated design with all key elements, materials, and levels clearly defined and ready for construction documentation.',
    'A comprehensive set of drawings and documentation that enables the project to be accurately priced and constructed without ambiguity.',
  ]

  return (
    <div className="border border-fg-border overflow-hidden bg-white">

      {/* ── HERO ── */}
      <div className="relative" style={{ height: 320 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_IMAGE}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 55%' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.05) 100%)' }}
        />
        <div className="absolute bottom-8 left-8 right-8">
          <h1 className="text-white font-light leading-tight mb-2" style={{ fontSize: 28, letterSpacing: '0.01em' }}>
            Landscape Design Proposal
          </h1>
          <p className="text-white/90 font-light text-lg">{clientName || 'Client Name'}</p>
          {projectAddress && (
            <p className="text-white/70 font-light text-sm mt-0.5">{projectAddress}</p>
          )}
        </div>
      </div>

      {/* ── INTRO — Split layout ── */}
      <div className="grid grid-cols-2 gap-0">
        {/* Left: image */}
        <div className="relative" style={{ minHeight: 300 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={INTRO_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover" />
        </div>
        {/* Right: text */}
        <div className="p-8 flex flex-col justify-center">
          <h2 className="font-light leading-tight mb-6" style={{ fontSize: 22, color: HEADING }}>
            A considered landscape, built around how you live.
          </h2>
          <div className="space-y-3 text-xs font-light leading-relaxed" style={{ color: BODY }}>
            <p><strong>{greeting}</strong></p>
            {displayIntro.split('\n').filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      </div>

      
      {/* ── WELCOME VIDEO ── */}
      <ProposalVideo
        url={welcomeVideoUrl ?? DEFAULT_WELCOME_VIDEO_URL}
        heading="Welcome to Formation"
        caption="A brief introduction to our team and how we approach every project."
      />

      {/* ── ABOUT FORMATION — Text left, image right ── */}
      <div className="grid grid-cols-2 gap-0">
        {/* Left: text */}
        <div className="p-8 flex flex-col justify-center">
          <h2 className="font-light mb-5" style={{ fontSize: 20, color: HEADING }}>
            About Formation
          </h2>
          <div className="space-y-3 text-xs font-light leading-relaxed" style={{ color: BODY }}>
            <p>
              At Formation Landscapes, we create outdoor environments that are considered,
              cohesive, and deeply connected to the home.
            </p>
            <p>
              With over 20 years of experience across both design and construction, we ensure each
              project is carefully resolved — from the overall vision through to the finer details.
            </p>
          </div>
        </div>
        {/* Right: image */}
        <div className="relative" style={{ minHeight: 260 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ABOUT_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 60%' }} />
        </div>
      </div>

      {/* ── DESIGN PROCESS — Image left, chevrons right ── */}
      <div className="grid grid-cols-2 gap-0 border-t" style={{ borderColor: BORDER }}>
        {/* Left: image */}
        <div className="relative" style={{ minHeight: 280 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PROCESS_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 70%' }} />
        </div>
        {/* Right: process steps */}
        <div className="p-8 flex flex-col justify-center">
          <h2 className="font-light mb-4" style={{ fontSize: 20, color: HEADING }}>
            Landscape Design Process
          </h2>
          <p className="text-xs font-light leading-relaxed mb-6" style={{ color: BODY }}>
            Our process is structured to ensure clarity, alignment, and a seamless transition from
            concept through to construction.
          </p>
          <div className="space-y-4">
            {phases.map((phase) => (
              <div key={phase.num}>
                <ChevronBadge number={phase.num} />
                <div className="mt-1 ml-1">
                  <p className="text-xs font-medium" style={{ color: HEADING }}>{phase.label}</p>
                  <p className="text-xs font-light" style={{ color: MUTED }}>{phase.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      
      {/* ── PROCESS VIDEO ── */}
      <ProposalVideo
        url={processVideoUrl ?? DEFAULT_PROCESS_VIDEO_URL}
        heading="Our Design Process"
        caption="See how we bring your outdoor vision to life, from concept through to construction-ready plans."
      />

      {/* ── PHASE DETAIL PAGES ── */}
      {phases.map((phase, i) => {
        const deliverables = scopeToPoints(phase.scope)
        return (
          <div key={phase.num} className="border-t p-8" style={{ borderColor: BORDER }}>
            <h3 className="font-light mb-3" style={{ fontSize: 20, color: HEADING }}>
              {phase.label} – {phase.title}
            </h3>

            {deliverables.length > 0 && (
              <p className="text-xs font-light leading-relaxed mb-6" style={{ color: BODY }}>
                {phaseDescriptions[i]}
              </p>
            )}

            <div className="grid grid-cols-2 gap-6">
              {/* Left: Deliverables */}
              <div>
                {deliverables.length > 0 ? (
                  <DeliverablesBox items={deliverables} />
                ) : (
                  <div className="rounded-lg p-5" style={{ backgroundColor: GREEN }}>
                    <h4 className="text-white text-sm font-light mb-2">Deliverables</h4>
                    <p className="text-white/70 text-xs font-light">Scope to be confirmed.</p>
                  </div>
                )}
              </div>
              {/* Right: Outcome */}
              <div className="flex flex-col justify-start pt-1">
                <h4 className="text-sm font-light mb-3" style={{ color: HEADING }}>Outcome</h4>
                <p className="text-xs font-light leading-relaxed" style={{ color: BODY }}>
                  {outcomes[i] || outcomes[0]}
                </p>
              </div>
            </div>
          </div>
        )
      })}

      {/* ── DESIGN FEES + PAYMENT TERMS ── */}
      <div className="border-t p-8" style={{ borderColor: BORDER }}>
        <h3 className="font-light mb-8" style={{ fontSize: 20, color: HEADING }}>
          Design Fees
        </h3>

        <div className="grid grid-cols-2 gap-8">
          {/* Left: Fee cards */}
          <div className="space-y-3">
            {phases.map((phase) => (
              <div
                key={phase.num}
                className="border-l-4 bg-white p-4 shadow-sm"
                style={{ borderLeftColor: BORDER, borderTop: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}
              >
                <p className="text-sm font-light" style={{ color: HEADING }}>
                  {phase.label} – {phase.title}
                </p>
                <p className="text-xs font-light mt-0.5" style={{ color: MUTED }}>
                  {formatCurrency(phase.fee)} + GST
                </p>
              </div>
            ))}
            <p className="text-sm font-semibold pt-2" style={{ color: HEADING }}>
              Total Design Fee: {formatCurrency(total)} + GST
            </p>
          </div>

          {/* Right: Payment Terms */}
          <div className="rounded-lg p-5" style={{ backgroundColor: GREEN }}>
            <h4 className="text-white text-sm font-light mb-3">Payment Terms</h4>
            <p className="text-white/80 text-xs font-light mb-4">
              Fees are invoiced in accordance with the following schedule:
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-white text-xs font-semibold mb-1">Phase 1 – Concept / Schematic Design</p>
                <ul className="space-y-0.5">
                  <li className="flex items-start gap-2">
                    <span className="text-white/60 mt-1 text-[5px]">●</span>
                    <span className="text-white/80 text-xs font-light">50% deposit prior to commencement</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-white/60 mt-1 text-[5px]">●</span>
                    <span className="text-white/80 text-xs font-light">50% balance upon completion of Phase 1</span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-white text-xs font-semibold mb-1">Phase 2 – Design Development</p>
                <ul className="space-y-0.5">
                  <li className="flex items-start gap-2">
                    <span className="text-white/60 mt-1 text-[5px]">●</span>
                    <span className="text-white/80 text-xs font-light">100% invoiced upon completion</span>
                  </li>
                </ul>
              </div>
              {phase3Fee ? (
                <div>
                  <p className="text-white text-xs font-semibold mb-1">Phase 3 – Administration</p>
                  <ul className="space-y-0.5">
                    <li className="flex items-start gap-2">
                      <span className="text-white/60 mt-1 text-[5px]">●</span>
                      <span className="text-white/80 text-xs font-light">100% invoiced upon completion</span>
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
            <p className="text-white/60 text-xs font-light mt-4">
              All invoices are payable within 7 days.
            </p>
          </div>
        </div>
      </div>

      {/* ── EXCLUSIONS ── */}
      <div className="border-t p-8" style={{ borderColor: BORDER }}>
        <h3 className="font-light mb-4" style={{ fontSize: 20, color: HEADING }}>
          Exclusions
        </h3>
        <p className="text-xs font-light leading-relaxed mb-6" style={{ color: BODY }}>
          This is a fixed-fee proposal. The following items are not included but can be incorporated
          into the construction scope or arranged separately if required:
        </p>
        <div className="grid grid-cols-4 gap-3">
          {[
            { title: 'Local Authority & Regulatory', desc: 'Submission fees' },
            { title: 'Engineering', desc: 'Engineering documentation' },
            { title: 'Arborist', desc: 'Arborist reports' },
            { title: 'Site Survey', desc: 'Site survey' },
          ].map((item, i) => (
            <div key={i} className="border rounded-lg p-4" style={{ borderColor: BORDER }}>
              <p className="text-xs font-medium mb-0.5" style={{ color: HEADING }}>{item.title}</p>
              <p className="text-xs font-light" style={{ color: MUTED }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── ACCEPTANCE SECTION ── */}
      <div className="border-t p-8" style={{ backgroundColor: BG_WARM, borderColor: BORDER }}>
        <div className="max-w-md mx-auto text-center">
          <h3 className="font-light mb-4" style={{ fontSize: 18, color: HEADING }}>
            Client Authorisation
          </h3>
          <p className="text-xs font-light leading-relaxed mb-5" style={{ color: BODY }}>
            By clicking accept below I acknowledge and agree to the above fee proposal, payment terms and
            conditions. Once acceptance is received a deposit invoice will be sent.
          </p>
          <div className="space-y-3 max-w-xs mx-auto">
            <div
              className="w-full px-4 py-3 bg-white border text-xs font-light text-left"
              style={{ borderColor: BORDER, color: LIGHT_MUTED }}
            >
              e.g. Jane Smith
            </div>
            <div
              className="w-full py-3 text-white text-xs font-light tracking-wide text-center rounded-full"
              style={{ backgroundColor: GREEN }}
            >
              Accept Proposal
            </div>
          </div>
        </div>
      </div>

      {/* ── VALIDITY ── */}
      <div className="px-8 py-4 border-t" style={{ borderColor: BORDER }}>
        <p className="text-xs font-light leading-relaxed" style={{ color: MUTED }}>
          This proposal is valid until{' '}
          {new Date(validUntil).toLocaleDateString('en-AU', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
          .
        </p>
      </div>

      {/* ── FOOTER ── */}
      <div className="py-10 px-8 text-center" style={{ backgroundColor: HEADING }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/formation-logo-white.svg" alt="Formation" className="h-5 w-auto mx-auto mb-2 opacity-80" />
        <p className="text-white/40 text-[10px] tracking-[0.2em] uppercase">Exceptional design, grounded in service</p>
        <p className="text-white/20 text-[10px] mt-2">&copy; Formation Landscapes Pty Ltd. All rights reserved.</p>
      </div>
    </div>
  )
}
