-- Subbie booking comments become an append-only, time-stamped LOG (applied 2026-07-02).
--
-- v1 had a single editable comment field saved on blur - unreliable to save and history was
-- lost on edit. Comments are now a jsonb array of {text, by, at}; the API appends, the UI
-- shows every entry with its timestamp. The old single-comment column is dropped (feature was
-- hours old, no data).
ALTER TABLE fg_subbie_bookings DROP COLUMN IF EXISTS comment;
ALTER TABLE fg_subbie_bookings ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '[]';
