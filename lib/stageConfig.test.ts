import { describe, it, expect } from 'vitest'
import { isLiveProject } from './stageConfig'
import type { Project } from '@/types'

// Only stage + status matter to isLiveProject; cast minimal objects.
const p = (stage: Project['stage'], status: Project['status']) => ({ stage, status }) as Pick<Project, 'stage' | 'status'>

describe('isLiveProject', () => {
  it('treats committed/in-flight stages as live regardless of the coarse status', () => {
    for (const stage of ['contracted', 'pre_start', 'active', 'completion', 'handover'] as const) {
      expect(isLiveProject(p(stage, 'planning'))).toBe(true)
    }
  })

  it('excludes pure pipeline stages', () => {
    expect(isLiveProject(p('design', 'planning'))).toBe(false)
    expect(isLiveProject(p('estimating', 'planning'))).toBe(false)
  })

  it('drops finished jobs even if the stage still reads in-flight', () => {
    expect(isLiveProject(p('active', 'complete'))).toBe(false)
    expect(isLiveProject(p('handover', 'invoiced'))).toBe(false)
  })

  it('falls back to status for legacy projects with no stage', () => {
    expect(isLiveProject(p(undefined, 'active'))).toBe(true)
    expect(isLiveProject(p(undefined, 'planning'))).toBe(false)
  })
})
