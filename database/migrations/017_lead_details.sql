-- A lead keeps the client's email and a note, and the day it was forwarded to an agent.
ALTER TABLE leads
  ADD COLUMN email VARCHAR(254) NULL,
  ADD COLUMN note VARCHAR(500) NULL,
  ADD COLUMN assigned_at DATE NULL;
UPDATE leads SET assigned_at = created_at WHERE agent_id IS NOT NULL;
