-- Invoice email open tracking. One row per claim, written ONLY by the tracking-pixel route
-- (service role) - deliberately separate from fg_progress_claims so the office's localStorage
-- newest-wins sync can never clobber a read receipt.
CREATE TABLE IF NOT EXISTS fg_claim_opens (
  claim_id TEXT PRIMARY KEY,
  project_id TEXT,
  first_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  open_count INT NOT NULL DEFAULT 1
);
-- Service-role only: RLS on, no policies.
ALTER TABLE fg_claim_opens ENABLE ROW LEVEL SECURITY;
