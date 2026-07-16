-- Editable intro text for the proposal's "See a sample" section (shown when sample packages are
-- ticked). Falls back to a default when blank.
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS samples_blurb TEXT;
