'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { loadProposals, saveProposal, generateRevenueFromProposal, saveDesignProject, loadDesignProjectByProposalId } from '@/lib/storage'
import { formatCurrency, generateId } from '@/lib/utils'
import type { DesignProposal, ProposalContentBlock, DesignProject } from '@/types'
import { ChevronDown, Check, Play } from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function scopeToPoints(scope: string): string[] {
  if (!scope) return []
  const byNewline = scope.split('\n').map(s => s.trim()).filter(Boolean)
  if (byNewline.length > 1) return byNewline
  return scope.split('. ').map(s => s.trim()).filter(Boolean)
}

// ── Brand colours ────────────────────────────────────────────────────────────

const GREEN = '#3D5A3A'
const HEADING = '#1a1a1a'
const BODY = '#2d2d2d'
const MUTED = '#6b6b6b'
const LIGHT_MUTED = '#8A8580'
const BORDER = '#e5e7eb'
const BG_WARM = '#F0EEEB'

// ── Portfolio images (fixed) ─────────────────────────────────────────────────

const HERO_IMAGE = '/proposal-hero-8.jpg'
const INTRO_IMAGE = '/proposal-hero-7.jpg'
const ABOUT_IMAGE = '/proposal-hero-6.jpg'
const EXPERIENCE_IMAGE = '/proposal-hero-3.jpg'
const PROCESS_IMAGE = '/proposal-hero-9.jpg'

// ── Video embed ──────────────────────────────────────────────────────────────

function VideoEmbed({ url }: { url: string }) {
  let embedUrl = url
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`
  const vmMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vmMatch) embedUrl = `https://player.vimeo.com/video/${vmMatch[1]}`
  return (
    <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
      <iframe
        src={embedUrl}
        className="absolute inset-0 w-full h-full"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        title="Embedded video"
      />
    </div>
  )
}

const DEFAULT_WELCOME_VIDEO_URL = 'https://vimeo.com/892469176'
const DEFAULT_PROCESS_VIDEO_URL = 'https://vimeo.com/867802765'

function RenderBlock({ block }: { block: ProposalContentBlock }) {
  if (block.type === 'video') {
    return (
      <div className="my-10">
        <VideoEmbed url={block.content} />
        {block.caption && (
          <p className="text-xs font-light text-center mt-3 italic" style={{ color: LIGHT_MUTED }}>{block.caption}</p>
        )}
      </div>
    )
  }
  if (block.type === 'text') {
    return (
      <div className="my-8">
        <p className="text-base font-light leading-relaxed" style={{ color: BODY }}>{block.content}</p>
        {block.caption && <p className="text-xs font-light mt-2 italic" style={{ color: LIGHT_MUTED }}>{block.caption}</p>}
      </div>
    )
  }
  if (block.type === 'image_url') {
    return (
      <div className="my-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={block.content} alt={block.caption ?? ''} className="w-full object-cover" />
        {block.caption && (
          <p className="text-xs font-light text-center mt-3 italic" style={{ color: LIGHT_MUTED }}>{block.caption}</p>
        )}
      </div>
    )
  }
  console.warn('[Formation] Unknown content block type:', block.type)
  return null
}

function BlocksAtPosition({
  blocks,
  position,
}: {
  blocks: ProposalContentBlock[]
  position: ProposalContentBlock['position']
}) {
  const matching = blocks.filter(b => b.position === position)
  if (!matching.length) return null
  return <>{matching.map(b => <RenderBlock key={b.id} block={b} />)}</>
}

// ── Acceptance Modal ─────────────────────────────────────────────────────────

function AcceptanceModal({
  name,
  onDismiss,
}: {
  name: string
  onDismiss: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-10 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: GREEN }}>
          <Check className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-semibold tracking-wide mb-3" style={{ color: HEADING }}>Accepted!</h2>
        <p className="text-base font-light mb-1" style={{ color: BODY }}>{name}</p>
        <p className="text-sm font-light mb-8" style={{ color: MUTED }}>{formatDate(new Date().toISOString())}</p>
        <button
          onClick={onDismiss}
          className="w-full py-3 text-white text-sm font-light tracking-wide rounded-full hover:opacity-90 transition-opacity"
          style={{ backgroundColor: HEADING }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ── Chevron Badge (phase number) ─────────────────────────────────────────────

function ChevronBadge({ number }: { number: number }) {
  return (
    <div className="relative w-full" style={{ height: 56 }}>
      <svg viewBox="0 0 600 56" className="w-full h-full" preserveAspectRatio="none">
        <polygon
          points="0,0 570,0 600,28 570,56 0,56 30,28"
          fill="#DADDE5"
        />
        <text
          x="300"
          y="32"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#4a4a4a"
          fontSize="20"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {number}
        </text>
      </svg>
    </div>
  )
}

// ── Deliverables Box (dark green) ────────────────────────────────────────────

function DeliverablesBox({ items }: { items: string[] }) {
  return (
    <div className="rounded-lg p-6" style={{ backgroundColor: GREEN }}>
      <h4 className="text-white text-lg font-light mb-4">Deliverables</h4>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="text-white/60 mt-1.5 text-[6px]">●</span>
            <span className="text-white/90 text-sm font-light leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Video Button ─────────────────────────────────────────────────────────────

function VideoButton({ label, url }: { label: string; url?: string }) {
  if (!url) return null
  const handleClick = () => { window.open(url, '_blank') }
  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-2 px-5 py-2.5 border rounded-full text-sm font-light transition-colors hover:bg-gray-50"
      style={{ borderColor: BORDER, color: HEADING }}
    >
      <Play className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ProposalAcceptancePage() {
  const params = useParams()
  const token = params.token as string

  const [proposal, setProposal] = useState<DesignProposal | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [acceptorName, setAcceptorName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const acceptSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const all = loadProposals()
    const p = all.find(pp => pp.acceptanceToken === token)
    if (!p) {
      setNotFound(true)
    } else {
      setProposal(p)
      if (p.status === 'accepted') setAccepted(true)
    }
  }, [token])

  const handleAccept = () => {
    if (!acceptorName.trim()) return setError('Please enter your name')
    if (!proposal) return
    const updated: DesignProposal = {
      ...proposal,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedByName: acceptorName.trim(),
    }
    saveProposal(updated)
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

    setProposal(updated)
    setShowModal(true)
  }

  const handleModalDismiss = () => {
    setShowModal(false)
    setAccepted(true)
  }

  // ── Not found ──
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: HEADING }}>
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/formation-logo-black.svg" alt="Formation" className="h-6 w-auto mx-auto mb-8 invert opacity-50" />
          <p className="text-sm font-light text-white/50">This proposal link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  // ── Loading ──
  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: HEADING }}>
        <div className="w-5 h-5 border border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  const total = proposal.phase1Fee + proposal.phase2Fee + (proposal.phase3Fee ?? 0)
  const gst = total * 0.1
  const blocks = proposal.contentBlocks ?? []

  // Find video URLs from content blocks
  const aboutVideo = blocks.find(b => b.type === 'video' && b.position === 'before_phases')
  const experienceVideo = blocks.find(b => b.type === 'video' && (b.position as string) === 'client_experience')

  const phases = [
    { num: 1, label: 'Phase 1', title: 'Concept / Schematic Design', scope: proposal.phase1Scope, fee: proposal.phase1Fee },
    { num: 2, label: 'Phase 2', title: 'Design Development', scope: proposal.phase2Scope, fee: proposal.phase2Fee },
    ...(proposal.phase3Fee
      ? [{ num: 3, label: 'Phase 3', title: 'Administration', scope: proposal.phase3Scope ?? '', fee: proposal.phase3Fee }]
      : []),
  ]

  // Default intro text
  const introText = proposal.introText || `Thank you for the opportunity to meet on site and discuss your project.\n\nFrom our initial consultation, it's clear there is a strong opportunity to reshape the landscape into a highly resolved, functional, and visually cohesive environment.\n\nThe following outlines our proposed design process and associated fees.`

  const proposalDate = proposal.createdAt
    ? formatDate(proposal.createdAt)
    : formatDate(new Date().toISOString())

  // Derive first names for greeting
  const firstName = proposal.clientName.split(' ').filter(Boolean)
  const greeting = firstName.length >= 3
    ? `Hi ${firstName[0]} and ${firstName[firstName.length - 1]},`
    : firstName.length === 2
      ? `Hi ${firstName[0]},`
      : `Hi ${proposal.clientName},`

  return (
    <>
      {showModal && (
        <AcceptanceModal
          name={acceptorName.trim()}
          onDismiss={handleModalDismiss}
        />
      )}

      {/* ── STICKY HEADER ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 bg-white/95 backdrop-blur-sm"
        style={{ height: 56, borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/formation-logo-black.svg" alt="Formation" className="h-5 w-auto" />
        </div>
        <div className="flex-1 mx-6 min-w-0 text-center hidden sm:block">
          <span className="text-xs tracking-[0.15em] uppercase" style={{ color: MUTED }}>
            {proposal.clientName} — Landscape Design Proposal
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold hidden sm:block tabular-nums" style={{ color: HEADING }}>
            {formatCurrency(total)} + GST
          </span>
          {accepted ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              <Check className="w-3.5 h-3.5" />
              Accepted
            </span>
          ) : (
            <button
              onClick={() => acceptSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="px-4 py-2 text-white text-xs font-light tracking-wide rounded-full hover:opacity-90 transition-opacity"
              style={{ backgroundColor: HEADING }}
            >
              Accept
            </button>
          )}
        </div>
      </header>

      {/* ── PAGE 1: HERO ── */}
      <div
        className="relative flex flex-col"
        style={{ height: '100vh' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HERO_IMAGE}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 55%' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.05) 100%)',
          }}
        />

        <div className="absolute bottom-20 left-10 right-10 sm:left-16 sm:right-1/3">
          <h1
            className="text-white font-light leading-tight mb-4"
            style={{ fontSize: 'clamp(36px, 5vw, 56px)', letterSpacing: '0.01em' }}
          >
            Landscape Design Proposal
          </h1>
          <p className="text-white/90 font-light mb-2" style={{ fontSize: 'clamp(18px, 2.5vw, 26px)' }}>
            {proposal.clientName}
          </p>
          {proposal.projectAddress && (
            <p className="text-white/70 font-light" style={{ fontSize: 'clamp(14px, 1.5vw, 18px)' }}>
              {proposal.projectAddress}
            </p>
          )}
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 animate-bounce">
          <ChevronDown className="w-6 h-6" />
        </div>
      </div>

      <main>

        {/* ── PAGE 2: INTRO — Split layout ── */}
        <section className="bg-white">
          <div className="max-w-[1200px] mx-auto px-8 py-20 md:py-28">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-start">
              {/* Left: rounded image */}
              <div className="relative overflow-hidden rounded-2xl" style={{ aspectRatio: '3/4' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={INTRO_IMAGE}
                  alt="Formation portfolio"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
              {/* Right: tagline + intro text */}
              <div className="flex flex-col justify-start pt-0 md:pt-8">
                <h2
                  className="font-light leading-tight mb-10"
                  style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', color: HEADING }}
                >
                  A considered landscape, built around how you live.
                </h2>
                <div className="space-y-5 text-base font-light leading-relaxed" style={{ color: BODY }}>
                  <p><strong>{greeting}</strong></p>
                  {introText.split('\n').filter(Boolean).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
                <BlocksAtPosition blocks={blocks} position="before_phases" />
              </div>
            </div>
          </div>
        </section>

        
        {/* ── WELCOME VIDEO ── */}
        <section className="bg-white border-t border-[#e5e7eb]">
          <div className="max-w-3xl mx-auto px-8 py-10">
            <h2 className="text-xl font-light mb-4" style={{ color: '#1a1a1a' }}>Welcome to Formation</h2>
            <div className="aspect-video w-full bg-black overflow-hidden rounded-sm">
              <VideoEmbed url={proposal.welcomeVideoUrl ?? DEFAULT_WELCOME_VIDEO_URL} />
            </div>
            <p className="text-xs font-light leading-relaxed mt-3" style={{ color: '#6b6b6b' }}>
              A brief introduction to our team and how we approach every project.
            </p>
          </div>
        </section>

        {/* ── PAGE 3: ABOUT FORMATION — Text left, image right (full height) ── */}
        {proposal.includeAboutSection !== false && (
          <section className="bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 min-h-[600px] md:min-h-[700px]">
              {/* Left: text */}
              <div className="flex flex-col justify-center px-8 md:px-16 py-20">
                <h2 className="font-light mb-8" style={{ fontSize: 'clamp(28px, 3vw, 40px)', color: HEADING }}>
                  About Formation
                </h2>
                <div className="space-y-5 text-base font-light leading-relaxed" style={{ color: BODY }}>
                  <p>
                    At Formation Landscapes, we create outdoor environments that are considered,
                    cohesive, and deeply connected to the home.
                  </p>
                  <p>
                    Our approach is design-led and grounded in understanding how you want to live. From
                    there, we shape a landscape that balances functionality, structure, and a strong
                    connection to greenery, ensuring the space feels both refined and easy to use day-to-day.
                  </p>
                  <p>
                    With over 20 years of experience across both design and construction, we ensure each
                    project is carefully resolved — from the overall vision through to the finer details —
                    delivering a seamless transition from concept to construction.
                  </p>
                </div>
                {aboutVideo ? (
                  <div className="mt-8">
                    <VideoButton label="Watch Formation Overview" url={aboutVideo.content} />
                  </div>
                ) : null}
              </div>
              {/* Right: full-height image */}
              <div className="relative min-h-[400px] md:min-h-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ABOUT_IMAGE}
                  alt="Formation project"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: 'center 60%' }}
                />
              </div>
            </div>
          </section>
        )}

        {/* ── PAGE 4: CLIENT EXPERIENCE — Text left, image right ── */}
        {proposal.includeAboutSection !== false && (
          <section className="bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 min-h-[600px] md:min-h-[700px]">
              {/* Left: text */}
              <div className="flex flex-col justify-center px-8 md:px-16 py-20">
                <h2 className="font-light mb-8" style={{ fontSize: 'clamp(28px, 3vw, 40px)', color: HEADING }}>
                  Client Experience
                </h2>
                <div className="space-y-5 text-base font-light leading-relaxed" style={{ color: BODY }}>
                  <p>
                    A well-executed project is as much about the process as it is the outcome. The following
                    reflects the experience of working with Formation Landscapes and the level of care taken
                    from concept through to construction.
                  </p>
                </div>
                {experienceVideo ? (
                  <div className="mt-8">
                    <VideoButton label="Watch Client Experience" url={experienceVideo.content} />
                  </div>
                ) : null}
              </div>
              {/* Right: full-height image */}
              <div className="relative min-h-[400px] md:min-h-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={EXPERIENCE_IMAGE}
                  alt="Formation client experience"
                  className="absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: 'center 55%' }}
                />
              </div>
            </div>
          </section>
        )}

        {/* ── PAGE 5: DESIGN PROCESS — Image left, chevrons right ── */}
        <section className="bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 min-h-[600px] md:min-h-[700px]">
            {/* Left: full-height image */}
            <div className="relative min-h-[400px] md:min-h-0 order-2 md:order-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={PROCESS_IMAGE}
                alt="Formation landscape"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition: 'center 70%' }}
              />
            </div>
            {/* Right: process steps */}
            <div className="flex flex-col justify-center px-8 md:px-16 py-20 order-1 md:order-2">
              <h2 className="font-light mb-6" style={{ fontSize: 'clamp(28px, 3vw, 40px)', color: HEADING }}>
                Landscape Design Process
              </h2>
              <p className="text-base font-light leading-relaxed mb-10" style={{ color: BODY }}>
                Our process is structured to ensure clarity, alignment, and a seamless transition from
                concept through to construction.
              </p>

              <div className="space-y-6">
                {phases.map((phase) => (
                  <div key={phase.num}>
                    <ChevronBadge number={phase.num} />
                    <div className="mt-2 ml-1">
                      <p className="text-sm font-medium" style={{ color: HEADING }}>{phase.label}</p>
                      <p className="text-sm font-light" style={{ color: MUTED }}>{phase.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        
        {/* ── PROCESS VIDEO ── */}
        <section className="bg-white border-t border-[#e5e7eb]">
          <div className="max-w-3xl mx-auto px-8 py-10">
            <h2 className="text-xl font-light mb-4" style={{ color: '#1a1a1a' }}>Our Design Process</h2>
            <div className="aspect-video w-full bg-black overflow-hidden rounded-sm">
              <VideoEmbed url={proposal.processVideoUrl ?? DEFAULT_PROCESS_VIDEO_URL} />
            </div>
            <p className="text-xs font-light leading-relaxed mt-3" style={{ color: '#6b6b6b' }}>
              See how we bring your outdoor vision to life, from concept through to construction-ready plans.
            </p>
          </div>
        </section>

        {/* ── PAGES 6-8: PHASE DETAIL PAGES ── */}
        {phases.map((phase, i) => {
          const deliverables = scopeToPoints(phase.scope)
          // Default outcome text per phase
          const outcomes = [
            'A clear and cohesive design direction that defines the layout, functionality, and overall aesthetic of the project.',
            'A resolved and coordinated design with all key elements, materials, and levels clearly defined and ready for construction documentation.',
            'A comprehensive set of drawings and documentation that enables the project to be accurately priced and constructed without ambiguity.',
          ]
          return (
            <section key={phase.num} className="bg-white border-t" style={{ borderColor: BORDER }}>
              <div className="max-w-[1200px] mx-auto px-8 py-20 md:py-28">
                <h2
                  className="font-light mb-6"
                  style={{ fontSize: 'clamp(28px, 3vw, 40px)', color: HEADING }}
                >
                  {phase.label} – {phase.title}
                </h2>

                {/* Phase description */}
                {deliverables.length > 0 && (
                  <p className="text-base font-light leading-relaxed mb-10" style={{ color: BODY }}>
                    {i === 0 && 'This stage focuses on establishing the overall vision and spatial layout of the project. We explore how the landscape will function, how key elements are positioned, and how the space will feel.'}
                    {i === 1 && 'During this stage, the concept is refined and resolved into a fully considered design. We work through how each element comes together, finalising layouts, levels, materials, and key selections.'}
                    {i === 2 && 'This stage translates the resolved design into detailed construction drawings and specifications. These documents provide clear instruction for construction, ensuring all elements are built accurately and consistently.'}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Left: Deliverables box */}
                  <div>
                    {deliverables.length > 0 ? (
                      <DeliverablesBox items={deliverables} />
                    ) : (
                      <div className="rounded-lg p-6" style={{ backgroundColor: GREEN }}>
                        <h4 className="text-white text-lg font-light mb-3">Deliverables</h4>
                        <p className="text-white/70 text-sm font-light">Scope to be confirmed.</p>
                      </div>
                    )}
                  </div>
                  {/* Right: Outcome */}
                  <div className="flex flex-col justify-start pt-2">
                    <h4 className="text-lg font-light mb-4" style={{ color: HEADING }}>Outcome</h4>
                    <p className="text-base font-light leading-relaxed" style={{ color: BODY }}>
                      {outcomes[i] || outcomes[0]}
                    </p>
                  </div>
                </div>

                {i === 0 && <BlocksAtPosition blocks={blocks} position="between_phase1_2" />}
                {i === 1 && phases.length > 2 && <BlocksAtPosition blocks={blocks} position="between_phase2_3" />}
              </div>
            </section>
          )
        })}

        {/* ── PAGE 9: DESIGN FEES + PAYMENT TERMS ── */}
        <section className="bg-white border-t" style={{ borderColor: BORDER }}>
          <div className="max-w-[1200px] mx-auto px-8 py-20 md:py-28">
            <h2
              className="font-light mb-12"
              style={{ fontSize: 'clamp(28px, 3vw, 40px)', color: HEADING }}
            >
              Design Fees
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Left: Fee cards */}
              <div className="space-y-4">
                {phases.map((phase) => (
                  <div
                    key={phase.num}
                    className="border-l-4 bg-white p-5 shadow-sm"
                    style={{ borderLeftColor: BORDER, borderTop: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}
                  >
                    <p className="text-base font-light" style={{ color: HEADING }}>
                      {phase.label} – {phase.title}
                    </p>
                    <p className="text-sm font-light mt-1" style={{ color: MUTED }}>
                      {formatCurrency(phase.fee)} + GST
                    </p>
                  </div>
                ))}

                <p className="text-base font-semibold pt-2" style={{ color: HEADING }}>
                  Total Design Fee: {formatCurrency(total)} + GST
                </p>
              </div>

              {/* Right: Payment Terms box (dark green) */}
              {proposal.includePaymentTerms !== false && (
                <div className="rounded-lg p-6" style={{ backgroundColor: GREEN }}>
                  <h4 className="text-white text-lg font-light mb-4">Payment Terms</h4>
                  <p className="text-white/80 text-sm font-light mb-5">
                    Fees are invoiced in accordance with the following schedule:
                  </p>

                  <div className="space-y-4">
                    <div>
                      <p className="text-white text-sm font-semibold mb-1">Phase 1 – Concept / Schematic Design</p>
                      <ul className="space-y-1">
                        <li className="flex items-start gap-2">
                          <span className="text-white/60 mt-1.5 text-[6px]">●</span>
                          <span className="text-white/80 text-sm font-light">50% deposit prior to commencement</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-white/60 mt-1.5 text-[6px]">●</span>
                          <span className="text-white/80 text-sm font-light">50% balance upon completion of Phase 1</span>
                        </li>
                      </ul>
                    </div>

                    <div>
                      <p className="text-white text-sm font-semibold mb-1">Phase 2 – Design Development</p>
                      <ul className="space-y-1">
                        <li className="flex items-start gap-2">
                          <span className="text-white/60 mt-1.5 text-[6px]">●</span>
                          <span className="text-white/80 text-sm font-light">100% invoiced upon completion of Phase 2</span>
                        </li>
                      </ul>
                    </div>

                    {proposal.phase3Fee ? (
                      <div>
                        <p className="text-white text-sm font-semibold mb-1">Phase 3 – Administration</p>
                        <ul className="space-y-1">
                          <li className="flex items-start gap-2">
                            <span className="text-white/60 mt-1.5 text-[6px]">●</span>
                            <span className="text-white/80 text-sm font-light">100% invoiced upon completion of Phase 3</span>
                          </li>
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <p className="text-white/60 text-xs font-light mt-6">
                    All invoices are payable within 7 days.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── PAGE 10: EXCLUSIONS ── */}
        {proposal.includeExclusions !== false && (
          <section className="bg-white border-t" style={{ borderColor: BORDER }}>
            <div className="max-w-[1200px] mx-auto px-8 py-20 md:py-28">
              <h2
                className="font-light mb-6"
                style={{ fontSize: 'clamp(28px, 3vw, 40px)', color: HEADING }}
              >
                Exclusions
              </h2>
              <p className="text-base font-light leading-relaxed mb-10" style={{ color: BODY }}>
                This is a fixed-fee proposal. The following items are not included but can be incorporated
                into the construction scope or arranged separately if required:
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { title: 'Local Authority & Regulatory', desc: 'Submission fees' },
                  { title: 'Engineering', desc: 'Engineering documentation' },
                  { title: 'Arborist', desc: 'Arborist reports' },
                  { title: 'Site Survey', desc: 'Site survey' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="border rounded-lg p-5"
                    style={{ borderColor: BORDER }}
                  >
                    <p className="text-sm font-medium mb-1" style={{ color: HEADING }}>{item.title}</p>
                    <p className="text-sm font-light" style={{ color: MUTED }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <BlocksAtPosition blocks={blocks} position="after_phases" />

        {/* ── ACCEPTANCE SECTION ── */}
        <section className="border-t" style={{ backgroundColor: BG_WARM, borderColor: BORDER }}>
          <div className="max-w-[640px] mx-auto px-8 py-20 md:py-28" ref={acceptSectionRef}>
            <h2
              className="font-light mb-8 text-center"
              style={{ fontSize: 'clamp(24px, 3vw, 36px)', color: HEADING }}
            >
              Client Authorisation
            </h2>

            {accepted ? (
              <div className="border border-green-200 bg-green-50 rounded-lg p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-6 h-6 text-white" />
                </div>
                <p className="text-lg font-semibold text-green-800 mb-2">
                  {proposal.acceptedByName || 'Client'} accepted this proposal
                </p>
                {proposal.acceptedAt && (
                  <p className="text-sm font-light text-green-700 mb-1">{formatDate(proposal.acceptedAt)}</p>
                )}
                {proposal.clientEmail && (
                  <p className="text-sm font-light text-green-600">{proposal.clientEmail}</p>
                )}
                <p className="text-sm font-light text-green-700 mt-4">
                  Thank you. We&apos;ll be in touch shortly to get started.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-base font-light leading-relaxed mb-8 text-center" style={{ color: BODY }}>
                  By clicking accept below I acknowledge and agree to the above fee proposal, payment terms and
                  conditions. Once acceptance is received a deposit invoice will be sent.
                </p>
                <div className="space-y-4 max-w-md mx-auto">
                  <div>
                    <label className="text-xs tracking-[0.15em] uppercase block mb-2" style={{ color: LIGHT_MUTED }}>
                      Your full name
                    </label>
                    <input
                      type="text"
                      value={acceptorName}
                      onChange={e => { setAcceptorName(e.target.value); setError('') }}
                      placeholder="e.g. Jane Smith"
                      className="w-full px-4 py-4 bg-white border text-base font-light outline-none transition-colors"
                      style={{
                        borderColor: error ? '#ef4444' : BORDER,
                        color: HEADING,
                      }}
                      onFocus={e => e.target.style.borderColor = HEADING}
                      onBlur={e => e.target.style.borderColor = error ? '#ef4444' : BORDER}
                    />
                    {error && <p className="text-xs text-red-500 font-light mt-2">{error}</p>}
                  </div>
                  <button
                    onClick={handleAccept}
                    className="w-full text-white tracking-wide hover:opacity-90 transition-opacity rounded-full"
                    style={{ height: 56, fontSize: 15, backgroundColor: GREEN }}
                  >
                    Accept Proposal
                  </button>
                  <p className="text-xs font-light text-center mt-3" style={{ color: LIGHT_MUTED }}>
                    By accepting, you agree to the above fee proposal and payment terms
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

      </main>

      {/* ── FOOTER ── */}
      <footer className="w-full py-16 px-8" style={{ backgroundColor: HEADING }}>
        <div className="max-w-2xl mx-auto text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/formation-logo-white.svg" alt="Formation" className="h-8 w-auto mx-auto mb-4 opacity-80" />
          <p className="text-white/40 text-xs tracking-[0.2em] uppercase">Exceptional design, grounded in service</p>
          <p className="text-white/20 text-xs mt-4">&copy; Formation Landscapes Pty Ltd. All rights reserved.</p>
        </div>
      </footer>
    </>
  )
}
