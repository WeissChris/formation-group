import { describe, it, expect } from 'vitest'
import {
  isValidEmail,
  proposalEmailSubject,
  buildProposalEmailText,
  buildProposalEmailHtml,
  sendProposalEmail,
  buildAcceptanceClientHtml,
  buildAcceptanceNotifyHtml,
  sendAcceptanceClientEmail,
  sendAcceptanceNotifyEmail,
  parseEmailList,
} from './email'

const base = {
  to: 'client@example.com',
  clientName: 'John Smith',
  proposalUrl: 'https://formation-group.vercel.app/proposal/abc123',
}

describe('isValidEmail', () => {
  it('accepts normal addresses, rejects junk', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('chris@formationlandscapes.com.au')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
    expect(isValidEmail('a b@c.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})

describe('parseEmailList (CC recipients)', () => {
  it('splits on commas, semicolons and spaces, keeping valid addresses', () => {
    expect(parseEmailList('a@b.co, c@d.com; e@f.org'))
      .toEqual(['a@b.co', 'c@d.com', 'e@f.org'])
  })

  it('drops invalid entries and de-duplicates (case-insensitive)', () => {
    expect(parseEmailList('a@b.co, nope, A@B.CO, , x@y')).toEqual(['a@b.co'])
  })

  it('returns an empty array for blank/undefined input', () => {
    expect(parseEmailList(undefined)).toEqual([])
    expect(parseEmailList('   ')).toEqual([])
  })
})

describe('proposalEmailSubject', () => {
  it('is a stable, branded subject', () => {
    expect(proposalEmailSubject()).toBe('Your landscape design proposal — Formation Landscapes')
  })
})

describe('buildProposalEmailText', () => {
  it('greets by first name and includes the link + signature', () => {
    const text = buildProposalEmailText(base)
    expect(text).toContain('Hi John,')
    expect(text).toContain(base.proposalUrl)
    expect(text).toContain('Formation Landscapes')
  })

  it('uses the custom email message (all paragraphs) when provided', () => {
    const text = buildProposalEmailText({ ...base, message: 'Custom opening line.\n\nSecond paragraph.' })
    expect(text).toContain('Custom opening line.')
    expect(text).toContain('Second paragraph.')   // the dedicated message renders in full
  })

  it('falls back to a default message when none provided', () => {
    expect(buildProposalEmailText(base)).toContain('Thank you for the opportunity')
  })

  it('falls back to "there" when the name is blank', () => {
    expect(buildProposalEmailText({ ...base, clientName: '' })).toContain('Hi there,')
  })

  it('greets both clients when a second name is given', () => {
    const text = buildProposalEmailText({ ...base, clientName: 'John Smith', clientName2: 'Jane Smith' })
    expect(text).toContain('Hi John and Jane,')
  })
})

describe('buildProposalEmailHtml', () => {
  it('includes the proposal link twice (button + fallback) and the greeting', () => {
    const html = buildProposalEmailHtml(base)
    expect(html).toContain('Hi John,')
    expect(html.match(/abc123/g)?.length).toBeGreaterThanOrEqual(2) // button href + visible link
    expect(html).toContain('href="https://formation-group.vercel.app/proposal/abc123"')
  })

  it('HTML-escapes the client name (no markup injection)', () => {
    const html = buildProposalEmailHtml({ ...base, clientName: 'A&B' })
    expect(html).toContain('Hi A&amp;B,')
    expect(html).not.toContain('Hi A&B,')
  })

  it('greets both clients in the HTML when a second name is given', () => {
    const html = buildProposalEmailHtml({ ...base, clientName: 'John Smith', clientName2: 'Jane Doe' })
    expect(html).toContain('Hi John and Jane,')
  })

  it('includes a hero photo and the Formation brand', () => {
    const html = buildProposalEmailHtml(base)
    expect(html).toContain('<img')
    expect(html).toContain('proposal-hero-8.jpg')
    expect(html).toContain('Formation Landscapes')
    expect(html).toContain('formationlandscapes.com.au')
  })

  it('shows the project address when provided, and omits it (no empty line) when not', () => {
    expect(buildProposalEmailHtml({ ...base, projectAddress: '55 Bath Road, Glen Iris' }))
      .toContain('55 Bath Road, Glen Iris')
    // No address → the heading is still there but no stray address markup
    const noAddr = buildProposalEmailHtml(base)
    expect(noAddr).toContain('Your landscape design proposal')
    expect(noAddr).not.toContain('Glen Iris')
  })
})

describe('sendProposalEmail (no API key configured)', () => {
  it('returns email_not_configured rather than throwing', async () => {
    // RESEND_API_KEY is unset in the test env.
    const result = await sendProposalEmail(base)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('email_not_configured')
  })
})

describe('acceptance emails', () => {
  const accept = {
    clientName: 'Kim Smiley',
    acceptedByName: 'Kim Smiley',
    clientEmail: 'kim@example.com',
    projectAddress: '209 Mont Albert Road',
    proposalUrl: 'https://formation-group.vercel.app/proposal/abc123',
    totalLabel: '$13,300',
  }

  it('client confirmation greets by name, thanks them, and links back to the proposal', () => {
    const html = buildAcceptanceClientHtml(accept)
    expect(html).toContain('Hi Kim,')
    expect(html).toContain('Thank you')
    expect(html).toContain('href="https://formation-group.vercel.app/proposal/abc123"')
    expect(html).toContain('<img')           // branded hero
    expect(html).toContain('209 Mont Albert Road')
  })

  it('internal notification shows who accepted, the project and the fee', () => {
    const html = buildAcceptanceNotifyHtml(accept)
    expect(html).toContain('Kim Smiley')
    expect(html).toContain('accepted their proposal')
    expect(html).toContain('209 Mont Albert Road')
    expect(html).toContain('$13,300')
    expect(html).toContain('href="https://formation-group.vercel.app/proposal/abc123"')
  })

  it('sendAcceptanceClientEmail rejects a missing/invalid client email before sending', async () => {
    expect((await sendAcceptanceClientEmail({ ...accept, clientEmail: undefined })).error).toBe('invalid_email')
    expect((await sendAcceptanceClientEmail({ ...accept, clientEmail: 'nope' })).error).toBe('invalid_email')
  })

  it('both senders return email_not_configured when no API key is set', async () => {
    expect((await sendAcceptanceClientEmail(accept)).error).toBe('email_not_configured')
    expect((await sendAcceptanceNotifyEmail(accept)).error).toBe('email_not_configured')
  })
})
