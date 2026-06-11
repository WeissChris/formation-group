-- Optional second client name (applied 2026-06-11).
--
-- Proposals often have two clients (husband and wife etc.). A single client_name field can't
-- address both cleanly, so this adds an optional second name. The proposal title/hero/header
-- show "A & B" and the page + emails greet "Hi A and B,".
--
-- Written by storageAsync.upsertProposal; read by publicData.mapProposalRow + storageAsync.mapProposal.
-- The public RPC get_proposal_by_token returns SETOF fg_proposals so it needs no change.
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS client_name2 TEXT;
