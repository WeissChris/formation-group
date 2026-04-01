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
}

const GREEN = '#3D5A3A'
const HEADING = '#1a1a1a'
const BODY = '#2d2d2d'
const MUTED = '#6b6b6b'
const BORDER = '#e5e7eb'

function scopeToPoints(scope: string): string[] {
  if (!scope) return []
  const byNewline = scope.split('\n').map(s => s.trim()).filter(Boolean)
  if (byNewline.length > 1) return byNewline
  return scope.split('. ').map(s => s.trim()).filter(Boolean)
}

export default function ProposalPreview({
  clientName, projectAddress, introText,
  phase1Scope, phase1Fee,
  phase2Scope, phase2Fee,
  phase3Scope, phase3Fee,
  validUntil,
}: Props) {
  const total = phase1Fee + phase2Fee + (phase3Fee ?? 0)
  const phases = [
    { num: 1, label: 'Phase 1', title: 'Concept / Schematic Design', scope: phase1Scope, fee: phase1Fee },
    { num: 2, label: 'Phase 2', title: 'Design Development', scope: phase2Scope, fee: phase2Fee },
    ...(phase3Scope && phase3Fee
      ? [{ num: 3, label: 'Phase 3', title: 'Administration', scope: phase3Scope, fee: phase3Fee }]
      : []),
  ]

  const defaultIntro = `Thank you for the opportunity to meet on site and discuss your project.\n\nThe following outlines our proposed design process and associated fees.`
  const displayIntro = introText || defaultIntro

  return (
    <div className="border border-fg-border overflow-hidden">
      {/* Hero preview */}
      <div
        className="relative h-48 bg-cover bg-center"
        style={{ backgroundImage: "url('/proposal-hero-8.jpg')" }}
      >
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.1) 100%)' }} />
        <div className="absolute bottom-4 left-6 right-6">
          <p className="text-white/80 text-xs tracking-widest uppercase mb-1">Landscape Design Proposal</p>
          <p className="text-white text-xl font-light">{clientName || 'Client Name'}</p>
          {projectAddress && <p className="text-white/70 text-sm font-light mt-0.5">{projectAddress}</p>}
        </div>
      </div>

      <div className="bg-white p-8 space-y-8">
        {/* Tagline + Intro */}
        <div>
          <h3 className="text-xl font-light mb-4" style={{ color: HEADING }}>
            A considered landscape, built around how you live.
          </h3>
          <div className="text-sm font-light leading-relaxed space-y-3" style={{ color: BODY }}>
            {displayIntro.split('\n').filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>

        {/* Phase details */}
        {phases.map((phase) => {
          const deliverables = scopeToPoints(phase.scope)
          return (
            <div key={phase.num} className="border-t pt-6" style={{ borderColor: BORDER }}>
              <h4 className="text-base font-light mb-3" style={{ color: HEADING }}>
                {phase.label} – {phase.title}
              </h4>
              {deliverables.length > 0 ? (
                <div className="rounded-lg p-4 mb-3" style={{ backgroundColor: GREEN }}>
                  <p className="text-white text-xs font-light mb-2">Deliverables</p>
                  <ul className="space-y-1.5">
                    {deliverables.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-white/50 mt-1 text-[5px]">●</span>
                        <span className="text-white/85 text-xs font-light leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm font-light italic" style={{ color: MUTED }}>Scope to be confirmed.</p>
              )}
            </div>
          )
        })}

        {/* Fees */}
        <div className="border-t pt-6" style={{ borderColor: BORDER }}>
          <h4 className="text-base font-light mb-4" style={{ color: HEADING }}>Design Fees</h4>
          <div className="space-y-3">
            {phases.map((phase) => (
              <div
                key={phase.num}
                className="border-l-4 p-3"
                style={{ borderLeftColor: BORDER, backgroundColor: '#fafafa' }}
              >
                <p className="text-sm font-light" style={{ color: HEADING }}>{phase.label} – {phase.title}</p>
                <p className="text-xs font-light mt-0.5" style={{ color: MUTED }}>{formatCurrency(phase.fee)} + GST</p>
              </div>
            ))}
          </div>
          <p className="text-sm font-semibold mt-4" style={{ color: HEADING }}>
            Total Design Fee: {formatCurrency(total)} + GST
          </p>
        </div>

        {/* Validity */}
        <p className="text-xs font-light leading-relaxed" style={{ color: MUTED }}>
          This proposal is valid until{' '}
          {new Date(validUntil).toLocaleDateString('en-AU', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
          . The client can accept using the acceptance link provided.
        </p>
      </div>
    </div>
  )
}
