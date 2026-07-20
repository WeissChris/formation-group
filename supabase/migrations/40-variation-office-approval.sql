-- Foreman variations now route through the office before the client sees them (applied 2026-07-20).
--
-- Previously a foreman-raised VMO was inserted straight as status 'sent' with an acceptance token
-- and the client was emailed immediately - which is why it was capped at $1000. The cap is gone and
-- the flow is now: foreman drafts (status 'draft' + submitted_at) -> Chris approves (status 'sent'
-- + office_approved_at, client emailed) -> client opens (first_viewed_at) -> client responds.
--
-- All columns are additive and nullable, so existing variations keep working untouched. The status
-- column itself is unchanged - the office/client stages are distinguished by these timestamps.
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS raised_by            TEXT;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS submitted_at         TEXT;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS office_approved_at   TEXT;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS office_rejected_at   TEXT;
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS office_reject_reason TEXT;
-- Client read receipt for the /variation/[token] page, mirroring fg_proposals.first_viewed_at.
ALTER TABLE fg_estimates ADD COLUMN IF NOT EXISTS first_viewed_at      TIMESTAMPTZ;
