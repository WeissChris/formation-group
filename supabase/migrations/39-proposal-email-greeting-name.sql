-- Optional override for the proposal delivery-email greeting ("Hi <name>,"). Used when the email
-- is addressed to an architect / agent rather than the client. Blank = greet the client as before.
ALTER TABLE fg_proposals ADD COLUMN IF NOT EXISTS email_greeting_name TEXT;
