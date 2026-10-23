-- A note on every call or message, and when the client asked to be contacted again.
ALTER TABLE lead_contacts
  ADD COLUMN comment VARCHAR(1000) NULL,
  ADD COLUMN follow_up_at DATETIME(3) NULL,                -- UTC
  ADD COLUMN follow_up_done TINYINT(1) NOT NULL DEFAULT 0,
  ADD KEY idx_contacts_followup (agent_id, follow_up_done, follow_up_at);
