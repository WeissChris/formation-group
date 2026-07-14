-- "C/o" line on a design proposal: the architect / agent acting on the client's behalf. Shown under
-- the client name on the proposal; not a greeted party (kept separate from client_name2).
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS care_of TEXT;
