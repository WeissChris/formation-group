-- "Program" box on the design proposal (applied 2026-06-12).
--
-- A timeline section near the end of the proposal telling the client how long each phase takes.
-- Editable per proposal (proposal.programText); a default (lib/proposalPhases.DEFAULT_PROGRAM_TEXT)
-- renders when blank. Written by storageAsync.upsertProposal; read by publicData.mapProposalRow +
-- storageAsync.mapProposal; the public RPC get_proposal_by_token returns SETOF so it picks it up.
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS program_text TEXT;
