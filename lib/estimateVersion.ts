// Estimate versioning: clone an estimate into a fresh draft version (v2, v3, ...) so a client can be
// shown several priced options without duplicating the whole quote by hand. Versions are tied by a
// versionGroupId (works before a project exists), falling back to a shared projectId for older quotes.
// Only ONE version should end up 'accepted' - that accepted one is what tracking reads.

import type { Estimate } from '@/types'

/** All base estimates (no variation parent) that belong to the same version family as `est`. */
export function versionFamily(all: Estimate[], est: Estimate): Estimate[] {
  return all.filter(e => !e.parentEstimateId && (
    e.id === est.id ||
    (!!est.versionGroupId && e.versionGroupId === est.versionGroupId) ||
    (!!est.projectId && e.projectId === est.projectId)
  ))
}

/** The group id that ties this estimate's versions together (its own id if none set yet). */
export function versionGroupIdOf(est: Estimate): string {
  return est.versionGroupId || est.id
}

/**
 * Build the next version from `source`: same scope, fresh ids, status reset to draft. The caller
 * persists both the returned estimate and (if it changed) the group-id backfill on the source.
 */
export function buildNextVersion(
  source: Estimate, all: Estimate[], newId: string, genId: () => string, nowIso: string,
): Estimate {
  const groupId = versionGroupIdOf(source)
  const fam = versionFamily(all, { ...source, versionGroupId: groupId })
  const nextVersion = Math.max(0, ...fam.map(e => e.version || 0)) + 1
  return {
    ...source,
    id: newId,
    versionGroupId: groupId,
    version: nextVersion,
    status: 'draft',
    isBaseline: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    // Clear the send/acceptance workflow and any variation identity - a new draft owns none of it.
    sentAt: undefined,
    acceptedAt: undefined,
    acceptanceToken: undefined,
    acceptedByName: undefined,
    declinedAt: undefined,
    declinedByName: undefined,
    sendMessage: undefined,
    archived: false,
    parentEstimateId: undefined,
    variationNumber: undefined,
    variationReason: undefined,
    variationAmount: undefined,
    // Fresh line-item ids (and re-mint nested labour-breakdown ids) so nothing is shared with v(N).
    lineItems: source.lineItems.map(li => ({
      ...li,
      id: genId(),
      estimateId: newId,
      labourBreakdown: li.labourBreakdown?.map(b => ({ ...b, id: genId() })),
    })),
    // Deep-copy the OPC doc so edits to the new version don't mutate the source's.
    opc: source.opc ? JSON.parse(JSON.stringify(source.opc)) as Estimate['opc'] : undefined,
  }
}
