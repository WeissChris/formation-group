import { describe, it, expect } from 'vitest'
import { nextSupervisorColour, supervisorColourByName, SUPERVISOR_PALETTE } from './supervisors'
import type { Supervisor } from '@/types'

const sup = (name: string, colour: string): Supervisor => ({ id: name, name, colour })

describe('nextSupervisorColour', () => {
  it('picks the first unused palette colour', () => {
    expect(nextSupervisorColour([])).toBe(SUPERVISOR_PALETTE[0])
    expect(nextSupervisorColour([sup('A', SUPERVISOR_PALETTE[0])])).toBe(SUPERVISOR_PALETTE[1])
  })
  it('cycles once the palette is exhausted', () => {
    const all = SUPERVISOR_PALETTE.map((c, i) => sup(`s${i}`, c))
    expect(nextSupervisorColour(all)).toBe(SUPERVISOR_PALETTE[all.length % SUPERVISOR_PALETTE.length])
  })
})

describe('supervisorColourByName', () => {
  it('maps name -> colour and skips unnamed entries', () => {
    const m = supervisorColourByName([sup('Cam', '#111111'), sup('', '#222222')])
    expect(m['Cam']).toBe('#111111')
    expect(Object.keys(m)).toEqual(['Cam'])
  })
})
