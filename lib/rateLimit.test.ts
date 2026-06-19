import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimit, clientIp, __resetRateLimit } from './rateLimit'

beforeEach(() => __resetRateLimit())

describe('rateLimit', () => {
  it('allows up to the limit, then blocks within the window', () => {
    const t = 1_000_000
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('k', 5, 60_000, t + i).allowed).toBe(true)
    }
    const blocked = rateLimit('k', 5, 60_000, t + 5)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('reports decreasing remaining budget', () => {
    const t = 2_000_000
    expect(rateLimit('k', 3, 1000, t).remaining).toBe(2)
    expect(rateLimit('k', 3, 1000, t).remaining).toBe(1)
    expect(rateLimit('k', 3, 1000, t).remaining).toBe(0)
  })

  it('lets the window slide — old hits expire so new ones are allowed', () => {
    const t = 3_000_000
    for (let i = 0; i < 5; i++) rateLimit('k', 5, 10_000, t)
    expect(rateLimit('k', 5, 10_000, t).allowed).toBe(false)
    // 10s + 1ms later, all the original hits have aged out
    expect(rateLimit('k', 5, 10_000, t + 10_001).allowed).toBe(true)
  })

  it('does not consume budget on a blocked call (window can fully drain)', () => {
    const t = 4_000_000
    for (let i = 0; i < 2; i++) rateLimit('k', 2, 10_000, t)
    rateLimit('k', 2, 10_000, t + 1)   // blocked, must not push a hit
    rateLimit('k', 2, 10_000, t + 2)   // blocked, must not push a hit
    // first hit was at t; it expires at t+10_000, so at t+10_001 we're clear
    expect(rateLimit('k', 2, 10_000, t + 10_001).allowed).toBe(true)
  })

  it('keys are independent (per IP / per route)', () => {
    const t = 5_000_000
    rateLimit('login:1.1.1.1', 1, 60_000, t)
    expect(rateLimit('login:1.1.1.1', 1, 60_000, t).allowed).toBe(false)
    expect(rateLimit('login:2.2.2.2', 1, 60_000, t).allowed).toBe(true)
  })
})

describe('clientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    const r = new Request('https://x', { headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' } })
    expect(clientIp(r)).toBe('203.0.113.7')
  })
  it('falls back to x-real-ip then unknown', () => {
    expect(clientIp(new Request('https://x', { headers: { 'x-real-ip': '198.51.100.4' } }))).toBe('198.51.100.4')
    expect(clientIp(new Request('https://x'))).toBe('unknown')
  })
})
