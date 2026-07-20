// The single source of truth for "where is this variation up to?".
//
// A variation is an fg_estimates row with parent_estimate_id set. Its stage is NOT the status
// column alone - a foreman draft, an office rejection and an office-approved-but-unsent variation
// all sit at status 'draft'/'sent', and are told apart by the workflow timestamps added in
// migration 40. Both the cockpit chips and the office approval queue render from this, so the two
// surfaces cannot drift.

/** Nullable everywhere: the API rows return null, the office Estimate type returns undefined. */
export interface VariationLike {
  status: string
  raisedBy?: string | null
  submittedAt?: string | null
  officeApprovedAt?: string | null
  officeRejectedAt?: string | null
  officeRejectReason?: string | null
  firstViewedAt?: string | null
  acceptedByName?: string | null
  acceptedAt?: string | null
  declinedAt?: string | null
}

export type VariationStageKey =
  | 'drafting'      // foreman is still writing it - not submitted
  | 'with_office'   // submitted, waiting on Chris
  | 'changes'       // office sent it back
  | 'sent'          // approved + emailed to the client, not opened yet
  | 'read'          // client opened the approval page
  | 'approved'      // client approved
  | 'declined'      // client declined
  | 'office'        // an office-created variation that has never been near the foreman flow

export interface VariationStage {
  key: VariationStageKey
  label: string
  level: 'red' | 'amber' | 'green' | 'muted'
}

/** Where a variation is up to. Order matters: the latest event wins. */
export function variationStage(v: VariationLike): VariationStage {
  if (v.status === 'accepted') return { key: 'approved', label: 'Approved', level: 'green' }
  if (v.status === 'declined') return { key: 'declined', label: 'Declined', level: 'muted' }

  if (v.status === 'sent') {
    if (v.firstViewedAt) return { key: 'read', label: 'Read by client', level: 'amber' }
    return { key: 'sent', label: 'Sent to client', level: 'amber' }
  }

  // Everything below is status 'draft' or the legacy office 'variation' status.
  if (v.officeRejectedAt) return { key: 'changes', label: 'Changes needed', level: 'red' }
  if (v.submittedAt) return { key: 'with_office', label: 'With office', level: 'amber' }
  if (v.raisedBy) return { key: 'drafting', label: 'Draft', level: 'muted' }
  return { key: 'office', label: 'Not sent', level: 'muted' }
}

/** Waiting on Chris: a foreman submitted it and the office has not approved or bounced it. */
export function isAwaitingOffice(v: VariationLike): boolean {
  return variationStage(v).key === 'with_office'
}

/** A foreman may still edit or bin it - nothing has gone to the client. */
export function isForemanEditable(v: VariationLike): boolean {
  const key = variationStage(v).key
  return (key === 'drafting' || key === 'with_office' || key === 'changes') && !v.officeApprovedAt
}

/** Whole days between an ISO timestamp and now (used for "sent N days ago, not opened"). */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((now.getTime() - t) / 86400000)
}
