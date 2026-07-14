-- Design-revision allowance on a proposal: how many rounds of design revisions are included in the
-- fee, plus an editable note (what happens beyond them). Shown as a clear callout on the proposal.
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS revisions_included INTEGER;
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS revisions_note TEXT;
