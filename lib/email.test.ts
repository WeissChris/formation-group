import { describe, it, expect } from 'vitest'
import {
  isValidEmail,
  proposalEmailSubject,
  buildProposalEmailText,
  buildProposalEmailHtml,
  sendProposalEmail,
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

  it('uses the proposal intro first paragraph when present', () => {
    const text = buildProposalEmailText({ ...base, introText: 'Custom opening line.\n\nSecond paragraph.' })
    expect(text).toContain('Custom opening line.')
    expect(text).not.toContain('Second paragraph.')
  })

  it('falls back to a default lead when no intro', () => {
    expect(buildProposalEmailText(base)).toContain('Thank you for the opportunity')
  })

  it('falls back to "there" when the name is blank', () => {
    expect(buildProposalEmailText({ ...base, clientName: '' })).toContain('Hi there,')
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
})

describe('sendProposalEmail (no API key configured)', () => {
  it('returns email_not_configured rather than throwing', async () => {
    // RESEND_API_KEY is unset in the test env.
    const result = await sendProposalEmail(base)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('email_not_configured')
  })
})
